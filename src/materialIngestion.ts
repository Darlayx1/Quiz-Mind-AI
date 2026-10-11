import { strFromU8, unzipSync } from 'fflate';

export interface DraftAttachment {
  id: string; name: string; size: number; fingerprint: string; kind: 'text' | 'document' | 'image';
  status: 'processing' | 'ready' | 'error'; text?: string; error?: string;
}
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 12000;
export const FILE_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.markdown,.text,.csv,.tsv,.json,.xml,.html,.log,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif,.bmp';
const textExtensions = /^(txt|md|markdown|text|csv|tsv|json|xml|html|log|yaml|yml)$/;
export function attachmentKind(name: string): DraftAttachment['kind'] {
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name) ? 'image' : textExtensions.test(name.split('.').at(-1)?.toLowerCase() || '') ? 'text' : 'document';
}
export async function attachmentFingerprint(file: File) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function validateAttachment(file: Pick<File, 'name' | 'size'>) {
  if (!file.size) throw new Error('File kosong. Pilih file yang berisi materi.');
  if (file.size > MAX_FILE_BYTES) throw new Error('File melebihi 5 MB. Pecah atau kompres file terlebih dahulu.');
  const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
  if (['doc', 'ppt', 'xls'].includes(extension)) throw new Error('Format Office lama belum didukung. Simpan sebagai DOCX, PPTX, XLSX, atau ekspor ke PDF/teks.');
  if (!FILE_ACCEPT.split(',').includes('.' + extension)) throw new Error('Format belum didukung. Gunakan PDF, DOCX, PPTX, XLSX, teks, atau gambar dengan teks.');
}
export function checkedText(text: string) {
  const result = text.replace(/\u0000/g, '').trim();
  if (!result) throw new Error('Tidak ada teks yang dapat dibaca. Untuk scan PDF, unggah halaman sebagai gambar atau tempel transkripsinya.');
  if (result.length > MAX_EXTRACTED_CHARS) throw new Error('Teks melebihi 12.000 karakter per file. Pecah materi menjadi bagian yang lebih kecil.');
  return result;
}
// Restrict decompression before allocating archive contents; ignore embedded objects/macros.
export function openXmlEntries(bytes: Uint8Array, extension: string) {
  let expanded = 0, entries = 0;
  let files: ReturnType<typeof unzipSync>;
  try { files = unzipSync(bytes, { filter: entry => {
    entries++; expanded += entry.originalSize;
    if (entries > 2000 || expanded > 20 * 1024 * 1024) throw new Error('Arsip dokumen terlalu besar setelah diekstrak.');
    return entry.name === '[Content_Types].xml' || (extension === 'docx' ? /^word\/document\.xml$/ : extension === 'pptx'
      ? /^ppt\/slides\/slide\d+\.xml$/ : /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/).test(entry.name);
  } }); } catch (error) {
    if ((error as Error).message.includes('terlalu besar')) throw error;
    throw new Error('Dokumen Office rusak atau tidak valid. Buka dan ekspor ulang sebagai DOCX/PPTX/XLSX atau teks.');
  }
  if (!files['[Content_Types].xml']) throw new Error('File bukan dokumen Office OpenXML yang valid.');
  return files;
}
function xml(bytes: Uint8Array): Document {
  const source = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('Dokumen berisi deklarasi XML yang tidak didukung.');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Struktur dokumen rusak atau tidak valid.');
  return document;
}
function nodes(root: Document | Element, tag: string) { return [...root.getElementsByTagNameNS('*', tag)]; }
export function extractOpenXml(bytes: Uint8Array, extension: string) {
  const files = openXmlEntries(bytes, extension);
  if (extension === 'docx') {
    if (!files['word/document.xml']) throw new Error('Isi DOCX tidak ditemukan.');
    return checkedText(nodes(xml(files['word/document.xml']), 'p').map(p => nodes(p, 't').map(n => n.textContent).join('')).join('\n'));
  }
  const paths = Object.keys(files).filter(p => extension === 'pptx' ? /^ppt\/slides\//.test(p) : /^xl\/worksheets\//.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!paths.length) throw new Error('Halaman dokumen tidak ditemukan.');
  if (extension === 'pptx') return checkedText(paths.map((p, i) => 'Slide ' + (i + 1) + '\n' + nodes(xml(files[p]), 'p').map(n => nodes(n, 't').map(t => t.textContent).join('')).join('\n')).join('\n\n'));
  const strings = files['xl/sharedStrings.xml'] ? nodes(xml(files['xl/sharedStrings.xml']), 'si').map(n => nodes(n, 't').map(t => t.textContent).join('')) : [];
  return checkedText(paths.map((p, i) => 'Sheet ' + (i + 1) + '\n' + nodes(xml(files[p]), 'row').map(row => nodes(row, 'c').map(cell => {
    const value = nodes(cell, 'v')[0]?.textContent ?? '';
    return cell.getAttribute('t') === 's' ? strings[Number(value)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? nodes(cell, 't').map(t => t.textContent).join('') : value;
  }).join('\t')).join('\n')).join('\n\n'));
}
async function extractPdf(bytes: Uint8Array, signal: AbortSignal) {
  const pdf = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  signal.throwIfAborted(); pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdf.getDocument({ data: bytes, useSystemFonts: false, stopAtErrors: true });
  const stop = () => { void task.destroy(); }; signal.addEventListener('abort', stop, { once: true });
  try {
    const document = await task.promise.catch(error => {
      throw new Error(error?.name === 'PasswordException' ? 'PDF dilindungi kata sandi. Ekspor salinan tanpa enkripsi atau tempel teksnya.' : 'PDF rusak atau belum dapat dibaca. Buka dan ekspor ulang sebagai PDF berteks.');
    });
    if (document.numPages > 80) throw new Error('PDF maksimal 80 halaman. Pilih bagian materi yang relevan.');
    let text = '';
    for (let i = 1; i <= document.numPages; i++) {
      signal.throwIfAborted(); const page = await document.getPage(i); const content = await page.getTextContent();
      text += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n';
      if (text.length > MAX_EXTRACTED_CHARS) throw new Error('Teks PDF melebihi 12.000 karakter. Pilih lebih sedikit halaman.');
      page.cleanup();
    }
    return checkedText(text);
  } finally { signal.removeEventListener('abort', stop); await task.destroy(); }
}
function imageMime(bytes: Uint8Array) {
  const header = [...bytes.slice(0, 12)];
  if (header[0] === 0x89 && strFromU8(bytes.slice(1, 4)) === 'PNG') return 'image/png';
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if (strFromU8(bytes.slice(0, 3)) === 'GIF') return 'image/gif';
  if (strFromU8(bytes.slice(0, 4)) === 'RIFF' && strFromU8(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (header[0] === 0x42 && header[1] === 0x4d) return 'image/bmp';
  throw new Error('Isi file bukan gambar raster yang didukung.');
}
async function extractImage(bytes: Uint8Array, signal: AbortSignal) {
  const blob = new Blob([bytes as BlobPart], { type: imageMime(bytes) });
  const bitmap = await createImageBitmap(blob).catch(() => { throw new Error('Gambar rusak atau tidak dapat dibuka. Ekspor ulang sebagai PNG atau JPEG.'); });
  const pixels = bitmap.width * bitmap.height; bitmap.close();
  if (pixels > 16000000) throw new Error('Gambar maksimal 16 megapiksel. Perkecil resolusi sebelum mengunggah.');
  signal.throwIfAborted();
  const worker = new Worker(new URL('./imageOcr.worker.ts', import.meta.url), { type: 'module' });
  let stop: () => void = () => {};
  try {
    const result = await new Promise<{ text: string; confidence: number }>((resolve, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener('abort', stop, { once: true });
      worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
      worker.onerror = () => reject(new Error('Pemroses OCR gagal dimuat. Muat ulang halaman atau tempel transkripsi teks.'));
      const assetBase = new URL(import.meta.env.BASE_URL + 'ingestion-assets/', window.location.origin).href;
      worker.postMessage({ blob, assetBase });
    });
    if (result.confidence < 25) throw new Error('Teks gambar kurang terbaca. Gunakan gambar lebih jelas atau tempel transkripsi.');
    return checkedText(result.text);
  } finally { signal.removeEventListener('abort', stop); worker.terminate(); }
}
export async function ingestAttachment(file: File, signal: AbortSignal): Promise<string> {
  validateAttachment(file); signal.throwIfAborted();
  const bytes = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
  const extension = file.name.split('.').at(-1)!.toLowerCase();
  if (textExtensions.test(extension)) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('File harus berupa teks UTF-8, bukan biner. Ekspor sebagai teks UTF-8.'); }
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) throw new Error('Isi biner tidak dapat digunakan sebagai materi teks.');
    if (extension === 'json') { try { JSON.parse(text); } catch { throw new Error('JSON tidak valid. Periksa isi file terlebih dahulu.'); } }
    if (extension === 'html' || extension === 'xml') {
      const document = new DOMParser().parseFromString(text, extension === 'html' ? 'text/html' : 'application/xml');
      if (document.getElementsByTagName('parsererror').length) throw new Error('XML tidak valid.');
      document.querySelectorAll('script,style').forEach(n => n.remove()); text = document.documentElement.textContent || '';
    }
    return checkedText(text);
  }
  if (extension === 'pdf') {
    if (!strFromU8(bytes.slice(0, 5)).startsWith('%PDF-')) throw new Error('Isi file bukan PDF yang valid.');
    return extractPdf(bytes, signal);
  }
  if (['docx', 'pptx', 'xlsx'].includes(extension)) return extractOpenXml(bytes, extension);
  return extractImage(bytes, signal);
}

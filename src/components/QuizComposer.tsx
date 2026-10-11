import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpenText, FileText, Image as ImageIcon, LoaderCircle, Paperclip, X } from 'lucide-react';
import { Button } from './Button.js';
import { MaterialContextEditor } from './MaterialContextEditor.js';
import { attachmentFingerprint, attachmentKind, FILE_ACCEPT, ingestAttachment, MAX_FILES, validateAttachment } from '../materialIngestion.js';
import { composerSources, type ComposerDraft } from '../composerDraft.js';

export function QuizComposer({ draft, patch, onContinue, busy, saving, saveError }: {
  draft: ComposerDraft; patch: (change: Partial<ComposerDraft> | ((d: ComposerDraft) => ComposerDraft)) => void;
  onContinue: () => void; busy: boolean; saving: boolean; saveError: string;
}) {
  const input = useRef<HTMLInputElement>(null), textarea = useRef<HTMLTextAreaElement>(null);
  const [contextOpen, setContextOpen] = useState(false), [dragging, setDragging] = useState(false), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<string | null>(null), [queuedFiles, setQueuedFiles] = useState(0);
  const live = useRef(draft); live.current = draft;
  const operations = useRef(new Map<string, AbortController>()), alive = useRef(true), queue = useRef(Promise.resolve());
  useEffect(() => { alive.current = true; return () => { alive.current = false; operations.current.forEach(controller => controller.abort()); }; }, []);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = Math.min(280, Math.max(136, textarea.current.scrollHeight)) + 'px'; } }, [draft.topic]);
  const change = (fn: (d: ComposerDraft) => ComposerDraft) => { if (!alive.current) return; live.current = fn(live.current); patch(fn); };
  const remove = (id: string) => { operations.current.get(id)?.abort(); change(d => ({ ...d, attachments: d.attachments.filter(a => a.id !== id) })); };
  const upload = (files: File[]) => {
    if (!files.length) return;
    setQueuedFiles(count => count + files.length);
    setNotice('');
    // Queue prevents racing duplicate selections and bounds concurrent OCR memory.
    for (const file of files) queue.current = queue.current.then(async () => {
      if (!alive.current) return;
      if (live.current.attachments.length >= MAX_FILES) { setNotice('Maksimal 5 lampiran. Hapus satu file untuk menambahkan lainnya.'); return; }
      const id = crypto.randomUUID(), controller = new AbortController(); operations.current.set(id, controller);
      let fingerprint = '';
      const timer = setTimeout(() => controller.abort(new Error('Pembacaan melewati 60 detik. Gunakan file lebih kecil atau transkripsi teks.')), 60000);
      try {
        validateAttachment(file); fingerprint = await attachmentFingerprint(file);
        controller.signal.throwIfAborted(); if (!alive.current) return;
        if (live.current.attachments.some(a => a.fingerprint === fingerprint)) { setNotice('File yang sama sudah dilampirkan: ' + file.name); return; }
        change(d => ({ ...d, attachments: [...d.attachments, { id, fingerprint, name: file.name, size: file.size, kind: attachmentKind(file.name), status: 'processing' }] }));
        const work = ingestAttachment(file, controller.signal);
        const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
        const text = await Promise.race([work, aborted]);
        controller.signal.throwIfAborted();
        change(d => ({ ...d, attachments: d.attachments.map(a => a.id === id ? { ...a, status: 'ready', text } : a) }));
      } catch (error) {
        if (!alive.current) return;
        const message = (error as Error).message || 'File rusak atau belum dapat dibaca. Ekspor sebagai teks lalu pilih kembali.';
        change(d => ({ ...d, attachments: d.attachments.some(a => a.id === id) ? d.attachments.map(a => a.id === id ? { ...a, status: 'error', error: message } : a)
          : controller.signal.aborted ? d.attachments : [...d.attachments, { id, fingerprint, name: file.name, size: file.size, kind: attachmentKind(file.name), status: 'error', error: message }] }));
      } finally { clearTimeout(timer); operations.current.delete(id); }
    }).catch(() => { if (alive.current) setNotice('Lampiran belum terbaca. Pilih kembali file.'); }).finally(() => { if (alive.current) setQueuedFiles(count => count - 1); });
  };
  const sources = composerSources(draft);
  return <>
    <form className={`quiz-composer ${dragging ? 'is-dragging' : ''}`} onSubmit={e => { e.preventDefault(); if (!sources.error && !busy && !queuedFiles) onContinue(); }}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) upload([...e.dataTransfer.files]); }}>
      <label htmlFor="composer-topic" className="sr-only">Topik atau instruksi kuis</label>
      <textarea ref={textarea} id="composer-topic" placeholder="Masukkan topik atau instruksi kuis..." value={draft.topic} maxLength={6000} disabled={busy} onChange={e => patch({ topic: e.target.value })} aria-describedby="composer-help" />
      {draft.attachments.length > 0 && <ul className="attachment-list" aria-label="Lampiran kuis">{draft.attachments.map(file => <li key={file.id} className={`attachment-chip ${file.status}`}>
        {file.status === 'processing' ? <LoaderCircle size={18} className="processing-icon" /> : file.kind === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
        <div><button type="button" className="attachment-name" title={file.name} disabled={file.status !== 'ready'} onClick={() => setPreview(file.id)}>{file.name}</button><span>{file.status === 'ready' ? file.kind === 'image' ? 'Teks OCR siap · periksa hasil' : 'Teks siap · lihat hasil' : file.status === 'processing' ? 'Membaca materi…' : 'Gagal dibaca'}</span>{file.error && <p role="alert">{file.error}</p>}</div>
        <button type="button" className="icon-button" aria-label={'Hapus lampiran ' + file.name} onClick={() => remove(file.id)}><X size={16} /></button>
      </li>)}</ul>}
      {draft.studyMaterial.trim() && <button type="button" className="context-indicator" onClick={() => setContextOpen(true)}><BookOpenText size={15} />Konteks ditambahkan<span>{draft.studyMaterial.length.toLocaleString('id-ID')} karakter</span></button>}
      <div className="composer-toolbar"><div className="composer-tools">
        <button type="button" className="composer-tool" aria-label="Unggah lampiran" title="Unggah lampiran" disabled={busy} onClick={() => input.current?.click()}><Paperclip size={21} /></button>
        <button type="button" className="composer-tool" aria-label="Tambah konteks materi" title="Tambah konteks materi" aria-haspopup="dialog" aria-expanded={contextOpen} disabled={busy} onClick={() => setContextOpen(true)}><BookOpenText size={21} />{draft.studyMaterial.trim() && <span className="context-dot" />}</button>
      </div><Button type="submit" label={busy ? 'Menyimpan…' : 'Buat Kuis'} icon={<ArrowRight size={17} />} iconPosition="trailing" disabled={!!sources.error || busy || !!queuedFiles} className="composer-cta" /></div>
      <input ref={input} type="file" accept={FILE_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Pilih lampiran materi" onChange={e => { upload([...e.target.files || []]); e.target.value = ''; }} />
      {dragging && <div className="composer-drop">Lepaskan file untuk menambahkan materi</div>}
    </form>
    <div className="composer-footnote"><p id="composer-help" aria-live="polite">{queuedFiles ? 'Membaca ' + queuedFiles + ' lampiran…' : sources.error || 'Sesuaikan tipe soal, kesulitan, dan waktu di langkah berikutnya.'}</p><span role="status">{saveError ? 'Draft belum tersimpan' : saving ? 'Menyimpan draft…' : 'Draft tersimpan di ruang aktif'}</span></div>
    {notice && <p role="status" className="composer-notice">{notice}</p>}
    {saveError && <p role="alert" className="form-alert">{saveError}</p>}
    <details className="upload-capabilities"><summary>Format & batas lampiran</summary><p>PDF dengan teks, DOCX, PPTX, XLSX, TXT, Markdown, CSV, JSON, XML, HTML, dan teks UTF-8. Gambar PNG, JPEG, WebP, GIF, BMP dibaca melalui OCR Indonesia/Inggris; hanya teks yang digunakan, bukan pemahaman diagram. GIF memakai frame pertama. Hasil ekstraksi dapat diperiksa lewat nama file.</p><p>Maks. 5 file · 5 MB/file · 12.000 karakter/file · gabungan materi 15.000 karakter. Office lama (DOC/PPT/XLS), dokumen terenkripsi, dan scan PDF perlu diekspor ke teks atau gambar. Tabel memakai nilai tersimpan; formula, gambar tertanam, dan catatan slide tidak dibaca.</p></details>
    {contextOpen && <MaterialContextEditor value={draft.studyMaterial} onChange={studyMaterial => patch({ studyMaterial })} onClose={() => setContextOpen(false)} />}
    {preview && draft.attachments.find(a => a.id === preview) && <AttachmentPreview text={draft.attachments.find(a => a.id === preview)!.text || ''} name={draft.attachments.find(a => a.id === preview)!.name} onClose={() => setPreview(null)} />}
  </>;
}
function AttachmentPreview({ text, name, onClose }: { text: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
  return <dialog className="material-dialog" ref={dialog} aria-labelledby="attachment-preview-title" onCancel={onClose}><div className="context-heading"><div><h2 id="attachment-preview-title">Hasil ekstraksi</h2><p>{name}</p></div><button className="icon-button" aria-label="Tutup hasil ekstraksi" onClick={onClose}><X size={20} /></button></div><div className="context-body"><pre className="extracted-text">{text}</pre></div><div className="context-footer"><Button label="Selesai" onClick={onClose} /></div></dialog>;
}

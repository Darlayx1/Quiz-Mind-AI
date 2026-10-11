import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

// Disposable local fixtures for browser QA. No personal material or AI credentials.
const directory = '.qa/composer/uploads';
await mkdir(directory, { recursive: true });
await writeFile(directory + '/catatan.txt', 'Klorofil menyerap energi cahaya. Fotosintesis menghasilkan glukosa dan oksigen.');
await writeFile(directory + '/unsupported.doc', 'This is deliberately unsupported.');
await writeFile(directory + '/corrupted.pdf', 'Not a PDF.');
await writeFile(directory + '/binary.txt', new Uint8Array([0, 1, 2, 255]));
const xml = (body, namespace) => '<?xml version="1.0"?><root xmlns="' + namespace + '">' + body + '</root>';
const types = strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
const zip = async (name, content) => writeFile(directory + '/' + name, zipSync({ '[Content_Types].xml': types, ...Object.fromEntries(Object.entries(content).map(([path, body]) => [path, strToU8(body)])) }));
await zip('materi.docx', { 'word/document.xml': xml('<p><r><t>Dokumen: klorofil menyerap cahaya matahari.</t></r></p><p><r><t>Fotosintesis terjadi di kloroplas.</t></r></p>', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main') });
await zip('presentasi.pptx', { 'ppt/slides/slide1.xml': xml('<p><r><t>Slide satu: respirasi sel menghasilkan energi.</t></r></p>', 'http://schemas.openxmlformats.org/drawingml/2006/main'), 'ppt/slides/slide2.xml': xml('<p><r><t>Slide dua: fotosintesis membutuhkan cahaya.</t></r></p>', 'http://schemas.openxmlformats.org/drawingml/2006/main') });
await zip('tabel.xlsx', { 'xl/sharedStrings.xml': xml('<si><t>Fotosintesis</t></si><si><t>Glukosa</t></si>', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'), 'xl/worksheets/sheet1.xml': xml('<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c><c><v>6</v></c></row>', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main') });
const stream = 'BT /F1 18 Tf 50 700 Td (Photosynthesis uses light energy. Chlorophyll absorbs sunlight.) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
];
let pdf = '%PDF-1.4\n', offsets = [0];
for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
const xref = Buffer.byteLength(pdf);
pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
await writeFile(directory + '/bacaan.pdf', pdf);
console.log('Local browser fixtures ready in ' + directory);

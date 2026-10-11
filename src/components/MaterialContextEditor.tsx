import { useEffect, useRef } from 'react';
import { BookOpenText, X } from 'lucide-react';
import { Button } from './Button.js';

export function MaterialContextEditor({ value, onChange, onClose }: { value: string; onChange: (text: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); dialog.current?.querySelector('textarea')?.focus(); return () => { dialog.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={dialog} className="material-dialog" aria-labelledby="context-title" onCancel={onClose}>
    <div className="context-heading"><span className="context-symbol"><BookOpenText size={22} /></span><div><h2 id="context-title">Konteks materi</h2><p>Beri kuis Anda referensi yang lebih kaya.</p></div><button type="button" className="icon-button" aria-label="Tutup konteks materi" onClick={onClose}><X size={20} /></button></div>
    <div className="context-body"><label htmlFor="material-context" className="field-label">Materi atau catatan referensi</label><textarea id="material-context" autoFocus rows={12} className="field-input" maxLength={12000} value={value} onChange={e => onChange(e.target.value)} placeholder="Tempel materi, catatan kelas, atau penjelasan konsep. Anda juga dapat menambahkan arahan untuk menggunakan materi ini." aria-describedby="context-help" /><p id="context-help" className="field-help">Konteks disimpan bersama draft. Topik dan lampiran tetap terpisah.</p><span className="context-count">{value.length.toLocaleString('id-ID')} / 12.000 karakter</span></div>
    <div className="context-footer"><Button label="Selesai" onClick={onClose} /></div>
  </dialog>;
}

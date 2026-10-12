import { useState } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { LANGUAGE_STYLES, languageStyleLabel } from '../languageStyles.js';
import { ConfigurationDialog } from './ConfigurationDialog.js';

export function LanguageStyleSelector({ value, custom, customText, presetValue = LANGUAGE_STYLES[0][0], onChange }: {
  value: string; custom: boolean; customText: string; presetValue?: string; onChange: (value: string, custom: boolean, customText: string) => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const selectedValue = custom ? value : LANGUAGE_STYLES.find(([label]) => label === value)?.[0] ?? presetValue;
  const select = (label: string) => { onChange(label, false, customText); };
  return <div className="style-control">
    <label className="field-label" htmlFor="language-style">Gaya bahasa</label>
    <div className={`style-input-group ${custom ? 'is-custom' : ''}`}><input id="language-style" type="text" maxLength={500} value={custom ? customText : ''} aria-label="Gaya bahasa kustom" placeholder="Gaya kustom (opsional)" onChange={event => { const text = event.target.value; onChange(text.trim() ? text : presetValue, !!text.trim(), text); }} aria-describedby="custom-style-help" /><button id="language-style-trigger" type="button" aria-label="Pilih preset gaya bahasa" title={languageStyleLabel(selectedValue, custom)} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setQuery(''); setOpen(true); }}><SlidersHorizontal size={16} /><span>Preset</span><ChevronDown size={14} /></button></div>
    <p id="custom-style-help" className="field-help">{custom && customText.trim() ? 'Gaya kustom aktif; menggantikan preset.' : `Biarkan kosong untuk mengikuti ${selectedValue}.`}</p>
    {open && <ConfigurationDialog title="Pilih gaya bahasa" description="Sesuaikan cara AI menyampaikan soal dan penjelasan." onClose={() => setOpen(false)}>
      {close => <>
      <div className="selector-search"><Search size={18} /><input autoFocus type="search" aria-label="Cari gaya bahasa" placeholder="Cari gaya bahasa…" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="selector-list" aria-label="Pilihan gaya bahasa">
        {LANGUAGE_STYLES.filter(([label, help]) => `${label} ${help}`.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id'))).map(([label, help]) => <button key={label} type="button" className="selector-option" aria-pressed={!custom && selectedValue === label} onClick={() => select(label)}><span><strong>{label}</strong><small>{help}</small></span>{!custom && selectedValue === label && <Check size={18} aria-label="Dipilih" />}</button>)}
        {!LANGUAGE_STYLES.some(([label, help]) => `${label} ${help}`.toLocaleLowerCase('id').includes(query.toLocaleLowerCase('id'))) && <p className="field-help">Tidak ada gaya yang cocok. Coba kata lain atau gunakan gaya kustom.</p>}
        <button className="selector-option custom-style-option" type="button" aria-pressed={custom} onClick={() => { onChange(customText.trim() ? customText : presetValue, !!customText.trim(), customText); close(); }}><span><strong>Gaya kustom</strong><small>Tulis satu instruksi gaya Anda sendiri.</small></span>{custom && <Check size={18} aria-label="Dipilih" />}</button>
      </div><div className="selector-footer"><span>{languageStyleLabel(selectedValue, custom)}</span><button type="button" className="preset-chip" onClick={close}>Selesai</button></div>
      </>}
    </ConfigurationDialog>}
  </div>;
}

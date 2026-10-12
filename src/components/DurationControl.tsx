import type { ReactNode } from 'react';
import { Check, Clock3, Hourglass, Infinity as InfinityIcon, Info, PencilLine, Timer } from 'lucide-react';

export function DurationControl({ sequential, value, unlimited, valid, onChange, onUnlimitedChange, children }: {
  sequential: boolean; value: string; unlimited: boolean; valid: boolean;
  onChange: (value: string) => void; onUnlimitedChange: (value: boolean) => void; children?: ReactNode;
}) {
  const presets = sequential ? [30, 60, 90, 120, 180] : [5, 10, 15, 20, 30];
  const unit = sequential ? 'detik' : 'menit', number = Number(value);
  const ModeIcon = sequential ? Timer : Clock3;
  return <section className={`timer-control duration-workspace ${unlimited ? 'is-unlimited' : ''}`} aria-labelledby="duration-title">
    <div className="duration-heading"><div className="duration-heading-copy"><span className="duration-symbol"><ModeIcon size={21} /></span><div><h3 id="duration-title">{sequential ? 'Waktu per soal' : 'Durasi seluruh kuis'}</h3><p>{sequential ? 'Ritme yang sama untuk setiap pertanyaan' : 'Satu timer untuk seluruh sesi latihan'}</p></div></div>
      <label className="duration-unlimited"><input type="checkbox" checked={unlimited} onChange={event => onUnlimitedChange(event.target.checked)} /><span className="duration-toggle" aria-hidden="true"><span /></span><InfinityIcon size={17} aria-hidden="true" /><span>Tanpa batas</span></label>
    </div>
    {unlimited ? <div className="duration-unlimited-state conditional-reveal" role="status"><InfinityIcon size={32} /><div><strong>Tanpa batas waktu</strong><p>Fokus pada pemahaman, sesuai ritme Anda.</p></div><Check size={18} /></div> : <>
      <div key={sequential ? 'question' : 'session'} className="duration-options conditional-reveal">
        <div className="duration-presets" role="group" aria-label={`Pilihan durasi dalam ${unit}`}>{presets.map(preset => <button key={preset} type="button" className="duration-preset" aria-pressed={number === preset} aria-label={`${preset} ${unit}`} onClick={() => onChange(String(preset))}><Clock3 size={14} aria-hidden="true" /><strong>{preset}</strong><span>{unit}</span>{number === preset && <span className="duration-selected-mark" aria-hidden="true"><Check size={11} /></span>}</button>)}</div>
        <div className={`duration-custom ${presets.includes(number) ? '' : 'is-custom'}`}><label htmlFor="quiz-duration"><PencilLine size={14} />Kustom</label><div className="duration-input-shell"><input id="quiz-duration" className="field-input" type="number" min={sequential ? 15 : 1} max={sequential ? 600 : 120} step={1} value={value} required aria-label={sequential ? 'Durasi kustom per soal' : 'Durasi kustom seluruh kuis'} aria-invalid={!valid} aria-describedby="duration-help" onChange={event => onChange(event.target.value)} /><span>{unit}</span></div></div>
      </div>
      <div className={`duration-footer ${valid ? '' : 'has-error'}`}><p id="duration-help" className={`field-help ${valid ? '' : 'field-error'}`}>{valid ? <Info size={14} /> : <Hourglass size={14} />}<span>{valid ? sequential ? 'Berlaku per soal; waktu khusus mengikuti komposisi.' : 'Berlaku untuk menyelesaikan seluruh kuis.' : `Masukkan bilangan bulat ${sequential ? '15–600 detik.' : '1–120 menit.'}`}</span></p><span className="duration-effective" aria-live="polite"><ModeIcon size={14} /><strong key={`${sequential}-${value}`}>{valid ? `${value} ${unit}` : 'Periksa durasi'}</strong><span>{sequential ? '/ soal' : '/ sesi'}</span></span></div>
      {children}
    </>}
  </section>;
}

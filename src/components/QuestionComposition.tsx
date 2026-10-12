import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, CircleDot, ListChecks, ToggleLeft, TextCursorInput, FilePenLine, Link2, ListOrdered } from 'lucide-react';
import { QUESTION_TYPES, type QuestionType } from '../types/quiz.js';
import { questionLabels } from '../questionState.js';
import { activeQuestionTypes, compositionError, effectiveCount, maximumPoints, typeSettingsError, type Composition } from '../questionComposition.js';
import { ConfigurationDialog } from './ConfigurationDialog.js';
export { defaultComposition, type Composition } from '../questionComposition.js';

const TYPE_INFO = {
  single_choice: { icon: CircleDot, description: 'Pilih satu jawaban yang paling tepat.', prompt: 'Planet mana yang dikenal sebagai planet merah?', answers: ['A. Bumi', 'B. Mars', 'C. Venus', 'D. Jupiter', 'E. Saturnus'] },
  multiple_select: { icon: ListChecks, description: 'Temukan beberapa jawaban yang benar.', prompt: 'Pilih semua sumber energi terbarukan.', answers: ['□ Matahari', '□ Batu bara', '□ Angin', '□ Minyak bumi', '□ Gas alam'] },
  true_false: { icon: ToggleLeft, description: 'Tentukan apakah sebuah pernyataan benar.', prompt: 'Bumi mengelilingi Matahari.', answers: ['Benar / Salah'] },
  short_answer: { icon: TextCursorInput, description: 'Jawab singkat dengan kata atau konsep.', prompt: 'Apa nama proses tumbuhan membuat makanan?', answers: ['Jawaban singkat: __________'] },
  essay: { icon: FilePenLine, description: 'Kembangkan gagasan dengan jawaban terbuka.', prompt: 'Jelaskan hubungan cahaya dan pertumbuhan tumbuhan.', answers: ['Tulis penjelasan Anda…', 'Penilaian menggunakan rubrik sesuai soal.'] },
  matching: { icon: Link2, description: 'Hubungkan setiap item dengan pasangannya.', prompt: 'Pasangkan organ dengan fungsinya.', answers: ['Jantung ↔ memompa darah', 'Paru-paru ↔ pertukaran gas'] },
  ordering: { icon: ListOrdered, description: 'Susun langkah dalam urutan yang tepat.', prompt: 'Urutkan tahapan pertumbuhan tanaman.', answers: ['1. Benih → 2. Kecambah → 3. Tanaman'] },
};

export function QuestionComposition({ value, onChange, count, onCountChange, timed = false, defaultSeconds = 60, children }: {
  value: Composition; onChange: (value: Composition) => void; count: number; onCountChange?: (n: number) => void;
  timed?: boolean; defaultSeconds?: number; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const patch = (change: Partial<Composition>) => onChange({ ...value, ...change });
  const total = effectiveCount(value, count), error = compositionError(value, count);
  const updateCount = (type: QuestionType, n: number) => value.mode === 'single' ? onCountChange?.(n) : patch({ distribution: { ...value.distribution, [type]: n } });
  const active = activeQuestionTypes(value);
  const rows = value.mode === 'single' ? [value.type] : QUESTION_TYPES;
  return <section className="menu-section question-composition" aria-labelledby="composition-title">
    <div className="menu-section-title"><span className="section-number">01</span><h2 id="composition-title">Komposisi soal</h2></div>
    <fieldset className="segmented-field"><legend className="sr-only">Bentuk latihan</legend><div className="segmented-control">
      {(['single', 'mixed'] as const).map(mode => <label key={mode}><input type="radio" name="composition" checked={value.mode === mode} onChange={() => patch({ mode })} /><span>{mode === 'single' ? 'Satu tipe' : 'Campuran'}</span></label>)}
    </div></fieldset>
    <div key={value.mode} className={`composition-rows conditional-reveal ${value.mode === 'single' ? 'single-composition' : timed ? 'with-time' : ''}`}>
      {rows.map(type => {
        const info = TYPE_INFO[type], Icon = info.icon, amount = value.mode === 'single' ? total : value.distribution[type] ?? 0;
        const settingsError = typeSettingsError(value, type, timed), countInvalid = !Number.isInteger(amount) || amount < (value.mode === 'single' ? 1 : 0) || amount > 100;
        const rowError = countInvalid ? `Jumlah harus bilangan bulat ${value.mode === 'single' ? '1' : '0'}–100.` : settingsError;
        const points = value.points[type] ?? 1, seconds = value.times?.[type];
        return <div className={`composition-row ${amount === 0 ? 'is-inactive' : ''}`} key={type}>
          <div className="composition-type"><Icon size={19} />{value.mode === 'single' ? <button type="button" className="type-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{questionLabels[type]}<ChevronDown size={17} /></button> : <strong>{questionLabels[type]}</strong>}{value.mode === 'single' && <small>{info.description}</small>}</div>
          <div className="row-control"><label htmlFor={value.mode === 'single' ? 'quiz-count' : `count-${type}`}>Jumlah soal</label><div className="count-stepper">
            <button type="button" aria-label={`Kurangi ${questionLabels[type]}`} disabled={amount <= (value.mode === 'single' ? 1 : 0) || !Number.isFinite(amount)} onClick={() => updateCount(type, Math.max(value.mode === 'single' ? 1 : 0, amount - 1))}>−</button>
            <input id={value.mode === 'single' ? 'quiz-count' : `count-${type}`} type="number" min={value.mode === 'single' ? 1 : 0} max={100} step={1} required aria-label={`Jumlah ${questionLabels[type]}`} aria-invalid={countInvalid} aria-describedby={rowError ? `row-error-${type}` : error ? 'composition-error' : undefined} value={Number.isFinite(amount) ? amount : ''} onChange={event => updateCount(type, event.target.value === '' ? NaN : Number(event.target.value))} />
            <button type="button" aria-label={`Tambah ${questionLabels[type]}`} disabled={total >= 100 || !Number.isFinite(amount)} onClick={() => updateCount(type, amount + 1)}>＋</button>
          </div></div>
          {value.mode === 'mixed' && <div className="row-control"><label htmlFor={`points-${type}`}>Poin / soal</label><input id={`points-${type}`} type="number" min={1} max={20} step={1} className="field-input" value={Number.isFinite(points) ? points : ''} aria-label={`Bobot ${questionLabels[type]}`} aria-invalid={!Number.isInteger(points) || points < 1 || points > 20} aria-describedby={settingsError ? `row-error-${type}` : undefined} onChange={event => patch({ points: { ...value.points, [type]: event.target.value === '' ? NaN : Number(event.target.value) } })} /></div>}
          {timed && value.mode === 'mixed' && <div className="row-control row-time conditional-reveal"><label htmlFor={`time-${type}`}>Detik / soal</label><input id={`time-${type}`} className="field-input" type="number" min={0} max={600} step={1} placeholder={String(defaultSeconds)} value={seconds ?? ''} aria-label={`Waktu ${questionLabels[type]}`} aria-invalid={seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 600)} aria-describedby={`time-help-${type}${settingsError ? ` row-error-${type}` : ''}`} onChange={event => { const times = { ...value.times }; if (event.target.value === '') delete times[type]; else times[type] = Number(event.target.value); patch({ times }); }} /><small id={`time-help-${type}`}>{seconds === 0 ? 'Tanpa batas' : seconds === undefined ? `Umum: ${Number.isFinite(defaultSeconds) ? defaultSeconds : '—'} dtk` : `${seconds} dtk`}</small></div>}
          {rowError && (amount !== 0 || countInvalid) && <p className="field-error row-error" id={`row-error-${type}`}>{rowError}</p>}
        </div>;
      })}
    </div>
    {value.mode === 'mixed' && <p className="field-help composition-hint">Jumlah 0 menonaktifkan tipe.{timed ? ' Waktu kosong mengikuti durasi umum; 0 berarti tanpa batas.' : ''}</p>}
    <div className="composition-total" aria-live="polite"><span>Total: <strong>{Number.isFinite(total) ? total : '—'} soal</strong></span><span>Nilai maksimum: <strong>{Number.isFinite(maximumPoints(value, count)) ? maximumPoints(value, count) : '—'} poin</strong></span></div>
    {error && <p className="field-error" id="composition-error">{error}</p>}
    {children}
    {open && <ConfigurationDialog title="Pilih tipe pertanyaan" description="Tujuh bentuk latihan. Buka contoh bila Anda ingin melihatnya." onClose={() => setOpen(false)} returnFocus=".type-trigger">
      {close => <>
      <div className="selector-list type-selector-list">{QUESTION_TYPES.map(type => { const info = TYPE_INFO[type], Icon = info.icon; return <div className="type-selector-entry" key={type}>
        <button type="button" className="selector-option" aria-pressed={value.type === type} onClick={() => patch({ type })}><Icon size={21} /><span><strong>{questionLabels[type]}</strong><small>{info.description}</small></span>{value.type === type && <Check size={18} aria-label="Dipilih" />}</button>
        <details className="type-preview"><summary>Contoh soal<span aria-hidden="true">＋</span></summary><div><span className="preview-caption">CONTOH LOKAL · TANPA AI</span><p>{info.prompt}</p><ul>{info.answers.map(answer => <li key={answer}>{answer}</li>)}</ul></div></details>
      </div>; })}</div><div className="selector-footer"><span>{questionLabels[value.type]} · Dipilih</span><button type="button" className="preset-chip" onClick={close}>Selesai</button></div>
      </>}
    </ConfigurationDialog>}
  </section>;
}

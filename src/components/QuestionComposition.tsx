import { Check, CircleDot, ListChecks, ToggleLeft, TextCursorInput, FilePenLine, Link2, ListOrdered, Shapes } from 'lucide-react';
import { QUESTION_TYPES, type QuestionType } from '../types/quiz.js';
import { questionLabels } from '../questionState.js';
import { activeQuestionTypes, allocatedCount, compositionError, equalDistribution, type Composition } from '../questionComposition.js';
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

export function QuestionComposition({ value, onChange, count }: {
  value: Composition; onChange: (value: Composition) => void; count: number;
}) {
  const patch = (change: Partial<Composition>) => onChange({ ...value, ...change });
  const active = activeQuestionTypes(value), total = allocatedCount(value), error = compositionError(value, count);
  const canDistribute = active.length > 0 && Number.isInteger(count) && count >= active.length && count <= 100;
  const updateCount = (type: QuestionType, n: number) => patch({ distribution: { ...value.distribution, [type]: n } });
  return <section className="surface menu-section question-composition" aria-labelledby="composition-title">
    <div className="menu-section-title"><Shapes size={20} /><h2 id="composition-title">Komposisi soal</h2><span className="section-number">01</span></div>
    <fieldset className="segmented-field"><legend className="field-label">Bentuk latihan</legend><div className="segmented-control">
      {(['single', 'mixed'] as const).map(mode => <label key={mode}><input type="radio" name="composition" checked={value.mode === mode} onChange={() => patch({ mode })} /><span>{mode === 'single' ? 'Satu tipe' : 'Campuran'}</span></label>)}
    </div></fieldset>
    <p className="field-help mode-explanation">{value.mode === 'single' ? 'Pilih satu bentuk soal. Jelajahi contoh sebelum memilih.' : 'Pilih beberapa tipe, lalu atur pembagiannya. Konfigurasi satu tipe tetap tersimpan.'}</p>
    <fieldset className="gallery-field"><legend className="sr-only">{value.mode === 'single' ? 'Pilih satu tipe soal' : 'Pilih tipe soal campuran'}</legend><div className="question-gallery">
      {QUESTION_TYPES.map(type => {
        const info = TYPE_INFO[type], Icon = info.icon, selected = active.includes(type);
        return <div key={type} className={`question-type-card ${selected ? 'selected' : ''}`} data-type={type}>
          <label className="question-type-select">
            <input type={value.mode === 'single' ? 'radio' : 'checkbox'} name={value.mode === 'single' ? 'question-type' : undefined} value={type} checked={selected}
              onChange={event => value.mode === 'single' ? patch({ type }) : updateCount(type, event.target.checked ? 1 : 0)} aria-label={questionLabels[type]} aria-describedby={`type-help-${type}`} />
            <span className="type-icon"><Icon size={20} /></span><span className="type-text"><strong>{questionLabels[type]}</strong><small id={`type-help-${type}`}>{info.description}</small></span>
            <span className="type-check" aria-hidden="true">{selected && <Check size={14} />}</span>
          </label>
          <details className="type-preview"><summary>Contoh soal<span aria-hidden="true">＋</span></summary><div><span className="preview-caption">CONTOH LOKAL · TANPA AI</span><p>{info.prompt}</p><ul>{info.answers.map(answer => <li key={answer}>{answer}</li>)}</ul></div></details>
        </div>;
      })}
    </div></fieldset>
    {value.mode === 'mixed' && <div className="composition-builder">
      <div className="composition-toolbar"><div><strong>Pembagian soal</strong><p id="allocation-status" role="status">{total} teralokasi dari {Number.isInteger(count) ? count : '—'} soal{total < count ? ` · ${count - total} tersisa` : total > count ? ` · ${total - count} berlebih` : ''}</p></div>
        <button type="button" className="preset-chip" disabled={!canDistribute} onClick={() => patch({ distribution: equalDistribution(active, count) })}>Bagi merata</button></div>
      <div className="distribution-bar" role="img" aria-label={`Distribusi ${total} soal: ${active.map(type => `${questionLabels[type]} ${value.distribution[type]}`).join(', ') || 'belum ada tipe dipilih'}`}>
        {active.map(type => <span key={type} className={`distribution-${type}`} style={{ flexGrow: value.distribution[type] }} />)}
      </div>
      {!active.length && <p className="field-error">Belum ada tipe dipilih. Pilih kartu di atas untuk memulai.</p>}
      {active.map(type => <div className="allocation-row" key={type}><label htmlFor={`count-${type}`}><span className={`distribution-key distribution-${type}`} />{questionLabels[type]}</label><div className="count-stepper">
        <button type="button" aria-label={`Kurangi ${questionLabels[type]}`} disabled={(value.distribution[type] ?? 0) <= 1} onClick={() => updateCount(type, (value.distribution[type] ?? 1) - 1)}>−</button>
        <input id={`count-${type}`} type="number" min={1} max={100} step={1} aria-label={`Jumlah ${questionLabels[type]}`} aria-invalid={!Number.isInteger(value.distribution[type]) || (value.distribution[type] ?? 0) > 100} aria-describedby={error ? 'composition-error' : undefined} value={value.distribution[type] ?? 0} onChange={event => updateCount(type, Math.max(1, Number(event.target.value) || 1))} />
        <button type="button" aria-label={`Tambah ${questionLabels[type]}`} disabled={total >= 100} onClick={() => updateCount(type, (value.distribution[type] ?? 0) + 1)}>＋</button>
      </div></div>)}
      {error && <p className="field-error" id="composition-error">{error}</p>}
      {!canDistribute && active.length > count && <p className="field-help">Total soal perlu minimal {active.length} agar setiap tipe mendapat satu soal.</p>}
      <p className="field-help">Ubah total soal di Intensitas latihan. Pembagian Anda tetap tersimpan sampai Anda mengubahnya atau memilih Bagi merata.</p>
    </div>}
  </section>;
}

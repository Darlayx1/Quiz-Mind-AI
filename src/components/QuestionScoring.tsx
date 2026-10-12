import { ShieldCheck } from 'lucide-react';
import { activeQuestionTypes, type Composition } from '../questionComposition.js';
import { questionLabels } from '../questionState.js';
import type { EvaluationSettings } from '../types/quiz.js';
import { modelName } from '../models.js';

export function QuestionScoring({ value, onChange, evaluator, onOpen }: {
  value: Composition; onChange: (value: Composition) => void; evaluator: EvaluationSettings; onOpen: () => void;
}) {
  const active = activeQuestionTypes(value), partial = active.some(type => type === 'multiple_select' || type === 'ordering');
  const written = active.some(type => type === 'short_answer' || type === 'essay');
  return <section className="surface menu-section scoring-section" aria-labelledby="scoring-title">
    <div className="menu-section-title"><ShieldCheck size={20} /><h2 id="scoring-title">Penilaian & bobot</h2><span className="section-number">03</span></div>
    <p className="field-help">Setiap soal bernilai 1 poin secara bawaan. Sesuaikan bobot 1–20 poin per soal.</p>
    {!active.length && <p className="field-help">Pilih tipe soal untuk mengatur penilaiannya.</p>}
    <div className="scoring-weights">{active.map(type => <div className="allocation-row" key={type}><label htmlFor={`points-${type}`}>{questionLabels[type]}</label><input id={`points-${type}`} type="number" min={1} max={20} step={1} className="field-input" value={value.points[type] ?? 1} onChange={event => onChange({ ...value, points: { ...value.points, [type]: Math.min(20, Math.max(1, Math.round(Number(event.target.value) || 1))) } })} /></div>)}</div>
    {partial && <label className="menu-checkbox scoring-partial"><input type="checkbox" checked={value.partialCredit} onChange={event => onChange({ ...value, partialCredit: event.target.checked })} /><span><strong>Berikan kredit parsial</strong><small>Jawaban sebagian benar pada pilihan ganda kompleks dan mengurutkan tetap mendapat poin.</small></span></label>}
    {active.includes('matching') && <p className="field-help">Menjodohkan dinilai per pasangan yang benar.</p>}
    {written && <div className="evaluation-summary"><strong>{evaluator.enabled ? 'Jawaban terbuka dinilai AI setelah dikumpulkan' : 'Evaluasi AI nonaktif'}</strong><p>{evaluator.enabled ? evaluator.followGenerator ? 'Mengikuti model pembuat soal.' : modelName(evaluator.model) + '.' : 'Tinjau manual atau jalankan evaluasi nanti.'} Jawaban tetap tersimpan jika penilaian gagal. Rubrik esai mengikuti soal yang dibuat.</p><button type="button" className="settings-link" onClick={onOpen}>Kelola Evaluasi AI</button></div>}
  </section>;
}

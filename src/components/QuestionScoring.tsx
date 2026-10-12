import { activeQuestionTypes, type Composition } from '../questionComposition.js';
import type { EvaluationSettings } from '../types/quiz.js';
import { modelName } from '../models.js';

// Contextual options stay inside composition; weights live in the question rows.
export function QuestionScoring({ value, onChange, evaluator, onOpen }: {
  value: Composition; onChange: (value: Composition) => void; evaluator: EvaluationSettings; onOpen: () => void;
}) {
  const active = activeQuestionTypes(value), partial = active.some(type => type === 'multiple_select' || type === 'ordering');
  const written = active.some(type => type === 'short_answer' || type === 'essay');
  return <div className="composition-grading">
    {partial && <label className="menu-checkbox scoring-partial"><input type="checkbox" checked={value.partialCredit} onChange={event => onChange({ ...value, partialCredit: event.target.checked })} /><span><strong>Berikan kredit parsial</strong><small>Jawaban sebagian benar pada pilihan ganda kompleks dan mengurutkan tetap mendapat poin.</small></span></label>}
    {active.includes('matching') && <p className="field-help">Menjodohkan dinilai per pasangan yang benar.</p>}
    {written && <div className="evaluation-summary"><div><strong>{evaluator.enabled ? 'Evaluasi AI untuk jawaban terbuka' : 'Evaluasi AI nonaktif'}</strong><p>{evaluator.enabled ? evaluator.followGenerator ? 'Mengikuti model pembuat soal.' : modelName(evaluator.model) + '.' : 'Tinjau manual atau evaluasi nanti.'} Rubrik esai mengikuti soal. Jawaban tetap tersimpan jika penilaian gagal.</p></div><button type="button" className="settings-link" onClick={onOpen}>Kelola Evaluasi AI</button></div>}
  </div>;
}

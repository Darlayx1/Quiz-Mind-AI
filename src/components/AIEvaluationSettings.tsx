import type { EvaluationSettings } from '../types/quiz.js';
import { normalizeEvaluationSettings } from '../evaluationSettings.js';
import { AI_MODELS } from '../models.js';
import { Select } from './Select.js';
export function AIEvaluationSettings({value,onSave,disabled=false}:{value:EvaluationSettings;onSave:(s:EvaluationSettings)=>Promise<void>;disabled?:boolean}) {
 return <fieldset disabled={disabled} className="settings-form settings-card"><h4>Evaluator kuis</h4><p className="settings-help">Isian singkat dan esai dievaluasi otomatis setelah dikumpulkan. Soal objektif dinilai langsung menggunakan kunci jawaban.</p><label htmlFor="eval-model">Model evaluator</label><Select id="eval-model" value={value.model} onChange={e=>void onSave(normalizeEvaluationSettings({...value,model:e.target.value}))}>{AI_MODELS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select><p className="settings-help">Model evaluator dipilih tersendiri. Perubahan tersimpan otomatis dan berlaku untuk kuis berikutnya.</p></fieldset>;
}

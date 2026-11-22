import type { EvaluationSettings } from '../types/quiz.js';
import { normalizeEvaluationSettings } from '../evaluationSettings.js';
import { AI_MODELS, allowedEffortsForModel, normalizeEffort, type ThinkingEffort } from '../models.js';
import { Select } from './Select.js';
export function AIEvaluationSettings({value,onSave,disabled=false}:{value:EvaluationSettings;onSave:(s:EvaluationSettings)=>Promise<void>;disabled?:boolean}) {
 const currentEffort = normalizeEffort(value.effort, value.model);
 return <fieldset disabled={disabled} className="settings-form settings-card"><h4>Evaluator kuis</h4><p className="settings-help">Isian singkat dan esai dievaluasi otomatis setelah dikumpulkan. Soal objektif dinilai langsung menggunakan kunci jawaban.</p><label htmlFor="eval-model">Model evaluator</label><Select id="eval-model" value={value.model} onChange={e=>{const nextModel=e.target.value;void onSave(normalizeEvaluationSettings({...value,model:nextModel,effort:normalizeEffort(value.effort,nextModel)}));}}>{AI_MODELS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select><label htmlFor="eval-effort">Effort</label><Select id="eval-effort" value={currentEffort} onChange={e=>void onSave(normalizeEvaluationSettings({...value,effort:normalizeEffort(e.target.value as ThinkingEffort,value.model)}))}>{allowedEffortsForModel(value.model).map(opt=><option key={opt.id} value={opt.id}>{opt.label}</option>)}</Select><p className="settings-help">Model dan tingkat effort evaluator dipilih tersendiri. Perubahan tersimpan otomatis dan berlaku untuk kuis berikutnya.</p></fieldset>;
}

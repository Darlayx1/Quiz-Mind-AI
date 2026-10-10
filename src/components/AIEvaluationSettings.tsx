import React,{useEffect,useState} from 'react';
import type { EvaluationSettings,Quiz,QuizSubmission } from '../types/quiz.js';
import { normalizeEvaluationSettings } from '../evaluationSettings.js';
import { AI_MODELS,defaultProviderModel,type AIProvider } from '../models.js';
const safeError=(e:unknown)=>e instanceof Error?e.message:'Operasi belum berhasil.';
export function AIEvaluationSettings({value,onSave}:{value:EvaluationSettings;onSave:(s:EvaluationSettings)=>Promise<void>}){
 const [draft,setDraft]=useState(value),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>setDraft(value),[JSON.stringify(value)]);
 const patch=(v:Partial<EvaluationSettings>)=>setDraft(old=>({...old,...v}));
 const save=async()=>{setBusy(true);setMessage('');try{const valid=normalizeEvaluationSettings(draft);await onSave(valid);setMessage('Pengaturan Evaluasi AI tersimpan. Kuis yang sudah dibuat tetap memakai snapshot sebelumnya.');}catch(e){setMessage(safeError(e));}finally{setBusy(false);}};
 const modelField=(label:string,provider:AIProvider,key:'model'|'fallbackModel'|'fallbackProviderModel')=><div><label htmlFor={'eval-'+key} className="field-label">{label}</label><input id={'eval-'+key} className="field-input" list={'eval-list-'+key} value={draft[key]} onChange={e=>patch({[key]:e.target.value})} maxLength={120}/><datalist id={'eval-list-'+key}>{AI_MODELS.filter(m=>m.provider===provider).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</datalist></div>;
 return <section className="evaluation-settings" aria-busy={busy}><div className="connection-section-heading"><div><h3>Evaluasi AI</h3><p>Nilai isian singkat dan esai berdasarkan standar jawaban dan rubrik. Model penilai dapat berbeda dari model pembuat soal.</p></div></div><fieldset disabled={busy}>
 <label className="key-checkbox"><input type="checkbox" checked={draft.enabled} onChange={e=>patch({enabled:e.target.checked})}/>Aktifkan evaluasi AI setelah kuis dikumpulkan</label>
 <label className="key-checkbox"><input type="checkbox" checked={draft.followGenerator} onChange={e=>patch({followGenerator:e.target.checked})}/>Ikuti model pembuat soal</label>
 <p className="field-help">Pilih model evaluator bila tidak mengikuti pembuat soal.</p>
 {modelField('Model evaluator (Gemini)',draft.provider,'model')}
 <label className="field-label" htmlFor="eval-short">Penilaian isian singkat</label><select id="eval-short" className="field-input" value={draft.shortAnswerMode} onChange={e=>patch({shortAnswerMode:e.target.value as 'hybrid'|'ai'})}><option value="hybrid">Alias sah secara lokal, jawaban lainnya dinilai AI</option><option value="ai">Semua jawaban nonkosong dinilai AI</option></select>
 <label className="key-checkbox"><input type="checkbox" checked={draft.reviewFlagged} onChange={e=>patch({reviewFlagged:e.target.checked})}/>Tinjau hasil yang ambigu atau bermasalah sebelum nilai final</label>
 <details className="connection-advanced"><summary>Cadangan evaluator & batas penggunaan</summary><label className="key-checkbox"><input type="checkbox" checked={draft.allowKeyFallback} onChange={e=>patch({allowKeyFallback:e.target.checked})}/>Gunakan key cadangan Google AI Studio jika tersedia</label><label className="key-checkbox"><input type="checkbox" checked={draft.allowModelFallback} onChange={e=>patch({allowModelFallback:e.target.checked})}/>Izinkan model cadangan evaluator</label>{draft.allowModelFallback&&modelField('Model cadangan (Gemini)',draft.provider,'fallbackModel')}<p className="field-help">Maksimal 3 percobaan per jawaban, termasuk cadangan. Tidak ada pencarian web saat penilaian. Setiap permintaan maksimal 45 detik; paling banyak dua jawaban per batch. Jawaban tersimpan pada ruang aktif; dikirim ke penyedia hanya saat evaluasi.</p></details>
 <div className="key-actions"><button type="button" className="connection-primary" onClick={()=>void save()}>Simpan pengaturan evaluator</button></div></fieldset><p role="status" className="field-help">{message}</p></section>;
}

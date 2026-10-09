import { DEFAULT_MODEL,defaultProviderModel,isProvider,modelInfo,validModelId } from './models.js';
import type { EvaluationSettings } from './types/quiz.js';
export const defaultEvaluationSettings:EvaluationSettings={enabled:true,followGenerator:true,provider:'gemini',model:DEFAULT_MODEL,shortAnswerMode:'hybrid',allowKeyFallback:true,allowModelFallback:false,fallbackModel:DEFAULT_MODEL,allowProviderFallback:false,fallbackProvider:'gemini',fallbackProviderModel:'gemini-3.5-flash-lite',reviewFlagged:true};
export function normalizeEvaluationSettings(input:unknown):EvaluationSettings {
 if(input===undefined)return {...defaultEvaluationSettings};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Pengaturan evaluasi AI tidak valid.');
 const raw = input as Record<string,any>;
 const s: EvaluationSettings = {
   ...defaultEvaluationSettings,
   ...(input as Partial<EvaluationSettings>),
   provider: 'gemini',
   fallbackProvider: 'gemini',
   model: modelInfo(raw.model)?.provider === 'gemini' ? raw.model : DEFAULT_MODEL,
   fallbackModel: modelInfo(raw.fallbackModel)?.provider === 'gemini' ? raw.fallbackModel : DEFAULT_MODEL,
   fallbackProviderModel: modelInfo(raw.fallbackProviderModel)?.provider === 'gemini' ? raw.fallbackProviderModel : 'gemini-3.5-flash-lite',
 };
 for(const k of ['enabled','followGenerator','allowKeyFallback','allowModelFallback','allowProviderFallback','reviewFlagged'] as const)if(typeof s[k]!=='boolean')throw new Error('Pengaturan evaluasi AI tidak valid.');
 if(!['hybrid','ai'].includes(s.shortAnswerMode)||!isProvider(s.provider)||!isProvider(s.fallbackProvider))throw new Error('Penyedia evaluator tidak valid.');
 for(const m of [s.model,s.fallbackModel,s.fallbackProviderModel])if(!validModelId(m))throw new Error('ID model evaluator tidak valid.');
 for(const [p,m]of [[s.provider,s.model],...(s.allowModelFallback?[[s.provider,s.fallbackModel]]:[]),...(s.allowProviderFallback?[[s.fallbackProvider,s.fallbackProviderModel]]:[])])if(modelInfo(m)?.provider&&modelInfo(m)!.provider!==p)throw new Error('Model evaluator tidak sesuai penyedia.');
 return s;
}
const KEY='quizmind_evaluation_preferences_v1';
export function loadEvaluationPreferences(){try{return normalizeEvaluationSettings(JSON.parse(localStorage.getItem(KEY)||'null')||undefined);}catch{return {...defaultEvaluationSettings};}}
export function saveEvaluationPreferences(value:EvaluationSettings){localStorage.setItem(KEY,JSON.stringify(normalizeEvaluationSettings(value)));}

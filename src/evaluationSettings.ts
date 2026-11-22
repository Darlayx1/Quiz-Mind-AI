import { DEFAULT_EFFORT, DEFAULT_MODEL, isProvider, isThinkingEffort, modelInfo, normalizeEffort, validModelId } from './models.js';
import type { EvaluationSettings } from './types/quiz.js';
export const defaultEvaluationSettings:EvaluationSettings={enabled:true,followGenerator:false,provider:'gemini',model:DEFAULT_MODEL,effort:DEFAULT_EFFORT,shortAnswerMode:'ai',allowKeyFallback:false,allowModelFallback:false,fallbackModel:DEFAULT_MODEL,allowProviderFallback:false,fallbackProvider:'gemini',fallbackProviderModel:'gemini-3.5-flash-lite',reviewFlagged:true};
export function normalizeEvaluationSettings(input:unknown):EvaluationSettings {
 if(input===undefined)return {...defaultEvaluationSettings};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Pengaturan evaluasi AI tidak valid.');
 const raw = input as Record<string,any>;
 if (raw.effort !== undefined && !isThinkingEffort(raw.effort)) throw new Error('Pengaturan effort evaluator tidak valid.');
 const resolvedModel = modelInfo(raw.model)?.provider === 'gemini' ? raw.model : DEFAULT_MODEL;
 const s: EvaluationSettings = {
   ...defaultEvaluationSettings,
   ...(input as Partial<EvaluationSettings>),
   enabled: true, followGenerator: false, allowKeyFallback: false, allowModelFallback: false, allowProviderFallback: false, shortAnswerMode: 'ai',
   provider: 'gemini',
   fallbackProvider: 'gemini',
   model: resolvedModel,
   effort: normalizeEffort(raw.effort, resolvedModel),
   fallbackModel: modelInfo(raw.fallbackModel)?.provider === 'gemini' ? raw.fallbackModel : DEFAULT_MODEL,
   fallbackProviderModel: modelInfo(raw.fallbackProviderModel)?.provider === 'gemini' ? raw.fallbackProviderModel : 'gemini-3.5-flash-lite',
 };
 for(const k of ['enabled','followGenerator','allowKeyFallback','allowModelFallback','allowProviderFallback','reviewFlagged'] as const)if(typeof s[k]!=='boolean')throw new Error('Pengaturan evaluasi AI tidak valid.');
 if(!['hybrid','ai'].includes(s.shortAnswerMode)||!isProvider(s.provider)||!isProvider(s.fallbackProvider))throw new Error('Penyedia evaluator tidak valid.');
 for(const m of [s.model,s.fallbackModel,s.fallbackProviderModel])if(!validModelId(m))throw new Error('ID model evaluator tidak valid.');
 for(const [p,m]of [[s.provider,s.model],...(s.allowModelFallback?[[s.provider,s.fallbackModel]]:[]),...(s.allowProviderFallback?[[s.fallbackProvider,s.fallbackProviderModel]]:[])])if(modelInfo(m)?.provider&&modelInfo(m)!.provider!==p)throw new Error('Model evaluator tidak sesuai penyedia.');
 return s;
}

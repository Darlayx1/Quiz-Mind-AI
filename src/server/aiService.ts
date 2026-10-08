import { modelInfo, providerName, type AIProvider } from '../models.js';
import { normalizeQuizConfig } from '../quizConfig.js';
import { QUESTION_TYPES, type Quiz, type QuestionType, type QuizConfig } from '../types/quiz.js';
import { QuizGenerationError } from './generationError.js';
import { generateQuizWithGroq, type GenerationOptions } from './groqService.js';
import { listProviderModels } from './providerClient.js';

export const providerAdapters = {
  gemini: { generate: async (config: QuizConfig, key?: string, options?: GenerationOptions) => (await import('./geminiService.js')).generateQuizWithGemini(config,key,options), listModels: (key: string, signal: AbortSignal) => listProviderModels('gemini',key,signal) },
  groq: { generate: generateQuizWithGroq, listModels: (key: string, signal: AbortSignal) => listProviderModels('groq',key,signal) },
};
async function generateBatch(input: QuizConfig, apiKey?: string, options: GenerationOptions = {}) {
  options={...options,attemptBudget:{calls:0}};
  const config = normalizeQuizConfig(input), provider = config.provider!;
  const signal = AbortSignal.any([AbortSignal.timeout(600_000), ...(options.signal ? [options.signal] : [])]);
  const execute = (provider: AIProvider, config: QuizConfig) => providerAdapters[provider].generate(config, apiKey, { ...options, signal });
  try { return await execute(provider,config); }
  catch (error: any) {
    signal.throwIfAborted();
    const settings = options.pool?.collection.settings;
    if (!settings?.allowProviderFallback || settings.fallbackProvider === provider || ['POOL_BUDGET','NETWORK_ERROR','INVALID_JSON','INVALID_QUIZ_STRUCTURE','INCOMPLETE_QUESTION_COUNT'].includes(error.code) || !([401,402,403,404,429,500,502,503,504].includes(error.status))) throw error;
    const fallbackProvider = settings.fallbackProvider!, fallbackModel = settings.fallbackModel!;
    if (!options.pool!.collection.keys.some(key => key.provider === fallbackProvider && key.enabled)) throw error;
    const supportsGrounding = modelInfo(fallbackModel)?.grounding === true;
    if (config.enableGrounding && !supportsGrounding && !settings.allowGroundingFallback) throw new QuizGenerationError('Penyedia cadangan tidak mendukung referensi web yang diminta. Periksa pengaturan cadangan.', 503, 'FALLBACK_CAPABILITY');
    options.onNotice?.(`Beralih dari ${providerName(provider)} ke ${providerName(fallbackProvider)} sesuai pengaturan. Materi dikirim ke penyedia cadangan.${config.enableGrounding && !supportsGrounding ? ' Melanjutkan tanpa pencarian web.' : ''}`);
    const quiz = await execute(fallbackProvider, { ...config, provider: fallbackProvider, model: fallbackModel, enableGrounding: fallbackProvider === 'groq' || (config.enableGrounding && supportsGrounding) });
    return { ...quiz, requestedProvider: provider, requestedModel: config.model };
  }
}

export async function generateQuiz(input:QuizConfig,apiKey?:string,options:GenerationOptions={}):Promise<Quiz>{
 const config=normalizeQuizConfig(input),signal=AbortSignal.any([AbortSignal.timeout(600_000),...(options.signal?[options.signal]:[])]);
 const active=QUESTION_TYPES.filter(t=>(config.questionDistribution?.[t]??0)>0);
 const questions:Quiz['questions']=[],generationBatches:NonNullable<Quiz['generationBatches']>=[];const research:{text?:string}={};let quiz:Quiz|undefined;const seen=new Set<string>();
 for(const type of active){
  let remaining=config.questionDistribution![type]!;
  while(remaining>0){
   signal.throwIfAborted();const count=Math.min(type==='essay'?2:5,remaining);
   const batch=await generateBatch({...config,questionType:type,questionCount:count,questionDistribution:{[type]:count},enableGrounding:config.provider==='gemini'&&quiz?.usedGrounding?false:config.enableGrounding},apiKey,{...options,signal,research});
   if(batch.questions.length!==count)throw new QuizGenerationError('Jumlah soal tidak sesuai distribusi.',502,'INCOMPLETE_QUESTION_COUNT');
   for(const q of batch.questions){const key=q.question.normalize('NFC').trim().toLocaleLowerCase();if(seen.has(key))throw new QuizGenerationError('Generator mengulang pertanyaan. Gunakan materi yang lebih beragam.',502,'DUPLICATE_QUESTION');seen.add(key);q.id='q_'+crypto.randomUUID();q.maxPoints=config.pointsByType?.[type]??1;if(q.type==='multiple_select'||q.type==='ordering')q.scoringMode=config.partialCredit?'partial':'exact';questions.push(q);}
   generationBatches.push({provider:batch.provider,model:batch.model,questionIds:batch.questions.map(q=>q.id)});quiz??=batch;remaining-=count;options.onNotice?.(questions.length+' dari '+config.questionCount+' soal selesai.');
  }
 }
 if(!quiz)throw new QuizGenerationError('Komposisi soal kosong.',400,'INVALID_CONFIG');
 return {...quiz,id:'quiz_'+crypto.randomUUID(),schemaVersion:2,questions,generationBatches,timePerQuestionByType:config.timePerQuestionByType,evaluationSettings:config.evaluationSettings};
}

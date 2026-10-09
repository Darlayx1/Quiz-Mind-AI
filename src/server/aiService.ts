import { type AIProvider } from '../models.js';
import { normalizeQuizConfig } from '../quizConfig.js';
import { QUESTION_TYPES, type Quiz, type QuestionType, type QuizConfig } from '../types/quiz.js';
import { QuizGenerationError } from './generationError.js';
import { listProviderModels } from './providerClient.js';
import type { KeyPool } from '../keyPool.js';

export type GenerationOptions = { pool?: KeyPool; signal?: AbortSignal; onNotice?: (message: string) => void; research?: { text?: string }; attemptBudget?: { calls: number } };

export const providerAdapters = {
  gemini: { generate: async (config: QuizConfig, key?: string, options?: GenerationOptions) => (await import('./geminiService.js')).generateQuizWithGemini(config,key,options), listModels: (key: string, signal: AbortSignal) => listProviderModels('gemini',key,signal) },
};
async function generateBatch(input: QuizConfig, apiKey?: string, options: GenerationOptions = {}) {
  options={...options,attemptBudget:{calls:0}};
  const config = normalizeQuizConfig(input);
  const signal = AbortSignal.any([AbortSignal.timeout(600_000), ...(options.signal ? [options.signal] : [])]);
  return await providerAdapters.gemini.generate(config, apiKey, { ...options, signal });
}

export async function generateQuiz(input:QuizConfig,apiKey?:string,options:GenerationOptions={}):Promise<Quiz>{
 const config=normalizeQuizConfig(input),signal=AbortSignal.any([AbortSignal.timeout(600_000),...(options.signal?[options.signal]:[])]);
 const active=QUESTION_TYPES.filter(t=>(config.questionDistribution?.[t]??0)>0);
 const questions:Quiz['questions']=[],generationBatches:NonNullable<Quiz['generationBatches']>=[];const research:{text?:string}={};let quiz:Quiz|undefined;const seen=new Set<string>();const groundingQueries=new Set<string>();
 for(const type of active){
  let remaining=config.questionDistribution![type]!;
  while(remaining>0){
   signal.throwIfAborted();const count=Math.min(type==='essay'?2:5,remaining);
   const batch=await generateBatch({...config,questionType:type,questionCount:count,questionDistribution:{[type]:count},enableGrounding:config.enableGrounding},apiKey,{...options,signal,research});
   for(const query of batch.groundingQueriesUsed??[])groundingQueries.add(query);
   if(batch.questions.length!==count)throw new QuizGenerationError('Jumlah soal tidak sesuai distribusi.',502,'INCOMPLETE_QUESTION_COUNT');
   for(const q of batch.questions){const key=q.question.normalize('NFC').trim().toLocaleLowerCase();if(seen.has(key))throw new QuizGenerationError('Generator mengulang pertanyaan. Gunakan materi yang lebih beragam.',502,'DUPLICATE_QUESTION');seen.add(key);q.id='q_'+crypto.randomUUID();q.maxPoints=config.pointsByType?.[type]??1;if(q.type==='multiple_select'||q.type==='ordering')q.scoringMode=config.partialCredit?'partial':'exact';questions.push(q);}
   generationBatches.push({provider:batch.provider,model:batch.model,questionIds:batch.questions.map(q=>q.id)});quiz??=batch;remaining-=count;options.onNotice?.(questions.length+' dari '+config.questionCount+' soal selesai.');
  }
 }
 if(!quiz)throw new QuizGenerationError('Komposisi soal kosong.',400,'INVALID_CONFIG');
 return {...quiz,id:'quiz_'+crypto.randomUUID(),schemaVersion:2,questions,generationBatches,groundingQueriesUsed:[...groundingQueries],timePerQuestionByType:config.timePerQuestionByType,evaluationSettings:config.evaluationSettings};
}

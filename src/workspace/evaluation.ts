import type { QuizResult, QuestionEvaluation } from '../types/quiz.js';
import type { Preferences, ApiKeyRecord, WorkspaceRepository } from './types.js';
import { availableKeys, keyStatus } from './types.js';
import { localCredential } from './localRepository.js';
import { invokeAccount } from './ai.js';
import { buildResult } from '../scoring.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';

export async function evaluateWorkspace(result: QuizResult, targets: string[] | undefined, preferences: Preferences, keys: ApiKeyRecord[], repository: WorkspaceRepository,
  signal: AbortSignal, checkpoint: (result: QuizResult) => Promise<unknown>) {
  const settings=result.evaluationSettings??result.quiz.evaluationSettings??preferences.evaluation??defaultEvaluationSettings;
  if(!settings.enabled)throw new Error('Aktifkan evaluator pada Model & penggunaan, atau tinjau nilai secara manual.');
  const ids=targets??Object.entries(result.evaluations??{}).filter(([,e])=>e.earnedPoints===null&&e.status!=='needs_review').map(([id])=>id);
  const model=settings.followGenerator?result.quiz.model??preferences.model:settings.model;
  const candidates=availableKeys(keys,{...preferences,fallback:settings.allowKeyFallback});
  if(!candidates.length)throw new Error('Tambahkan key aktif pada ruang ini untuk evaluasi.');
  let current=structuredClone(result),cursor=0;
  while(cursor<ids.length){
    signal.throwIfAborted();
    const group=ids.slice(cursor,cursor+2);cursor+=group.length;
    const previous=current.evaluations??{};
    const exhausted=group.some(id=>(previous[id]?.attemptCount??0)>=3);
    if(exhausted)throw new Error('Tiga percobaan evaluasi telah digunakan. Tinjau jawaban secara manual.');
    let evaluations:Record<string,QuestionEvaluation>|undefined,last:unknown,keyIndex=0,currentModel=model;
    const remaining=Math.min(preferences.maxAttempts,...group.map(id=>3-(previous[id]?.attemptCount??0)));
    for(let attempt=0;attempt<remaining;attempt++){
      signal.throwIfAborted();const key=candidates[keyIndex];
      try{
        const input={quiz:current.quiz,submission:current.submission,settings,targetQuestionIds:group,previous};
        if(repository.scope==='guest'){
          const {evaluateSingleCall}=await import('../server/evaluationService.js');
          evaluations=await evaluateSingleCall(input,await localCredential(key.id),currentModel,AbortSignal.any([signal,AbortSignal.timeout(45000)]));
          await repository.recordKeyOutcome(key.id,'available');
        }else evaluations=(await invokeAccount({action:'evaluate',input,model:currentModel,keyId:key.id},signal,repository.scope)).evaluations;
        break;
      }catch(error){
        if(signal.aborted)throw error;last=error;
        if(repository.scope==='guest')await repository.recordKeyOutcome(key.id,keyStatus(error));
        for(const id of group)previous[id]={...previous[id],attemptCount:(previous[id]?.attemptCount??0)+1};
        const code=Number((error as any).status);
        if(code===400)break;
        if(code===404||['invalid','quota'].includes(keyStatus(error))){
          if(code!==404&&keyIndex+1<candidates.length)keyIndex++;
          else if(settings.allowModelFallback&&currentModel!==settings.fallbackModel)currentModel=settings.fallbackModel;
          else break;
        }
      }
    }
    if(!evaluations){ evaluations={};for(const id of group)evaluations[id]={...previous[id],status:'failed',earnedPoints:null,feedback:(last as Error)?.message??'Evaluasi belum berhasil.'}; }
    const next=buildResult(current.quiz,current.submission,{...previous,...evaluations},settings);
    current=next;await checkpoint(next);
  }
  return current;
}

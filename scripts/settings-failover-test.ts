import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { localRepository } from '../src/workspace/localRepository.js';
import { emptyWorkspace, sanitizeWorkspace, keyPaused } from '../src/workspace/types.js';
import { normalizeEvaluationSettings } from '../src/evaluationSettings.js';
import { validateQuestion } from '../src/questionValidation.js';
import { buildResult } from '../src/scoring.js';
import { evaluateWorkspace } from '../src/workspace/evaluation.js';
import type { Quiz, QuizSubmission } from '../src/types/quiz.js';
import { fixtures } from './assessment-fixtures.js';
const preferences=emptyWorkspace().preferences;
const settings=normalizeEvaluationSettings({...preferences.evaluation,model:'gemini-3.5-flash-lite',followGenerator:true,enabled:false,allowKeyFallback:false});
assert.equal(settings.enabled,true);assert.equal(settings.followGenerator,false);assert.equal(settings.allowKeyFallback,true);
assert.equal(sanitizeWorkspace({preferences:{...preferences,fallback:false,evaluation:settings}}).preferences.fallback,true);
await localRepository.load();
await localRepository.putKey({label:'',secret:'fixture-evaluator-primary'});
await localRepository.putKey({label:'',secret:'fixture-evaluator-backup'});
const keys=await localRepository.keys();
const quiz:Quiz={id:'eval-fixture',title:'Konsep',topic:'Konsep',summary:'Latihan',difficulty:'easy',timeLimitMinutes:0,createdAt:new Date().toISOString(),model:preferences.model,evaluationSettings:settings,questions:[0,1,2].map(i=>validateQuestion({...fixtures.essay,id:'q'+i},i,'Konsep',[],'essay')!)};
const submission:QuizSubmission={quizId:quiz.id,completedAt:new Date().toISOString(),timeTakenSeconds:1,bookmarkedQuestions:[],userAnswers:Object.fromEntries(quiz.questions.map(q=>[q.id,{type:'essay',text:'Jawaban konsep lengkap.'}]))};
const original=globalThis.fetch;const models:string[]=[],secrets:string[]=[];let calls=0;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init);calls++;models.push(req.url);secrets.push(req.headers.get('x-goog-api-key')??'');
 if(calls===1)return Response.json({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'Quota limit'}},{status:429});
 const body=await req.json(),prompt=body.contents[0].parts.map((p:any)=>p.text??'').join('');
 const data=JSON.parse(prompt.split('DATA: ').at(-1)!);
 const output={results:data.map((q:any)=>({questionId:q.questionId,criteria:q.rubric.map((c:any)=>({criterionId:c.id,level:1,evidence:'Jawaban konsep',feedback:'Sesuai.'})),feedback:'Sesuai rubrik.',reviewFlags:[]}))};
 return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(output)}]}}]});
};
try {
 let checkpoints=0;
 const result=await evaluateWorkspace(buildResult(quiz,submission,undefined,settings),undefined,{...preferences,keyId:keys[0].id,fallback:false},keys,localRepository,new AbortController().signal,async()=>{checkpoints++;});
 assert.equal(result.finalScore,100);assert.equal(calls,3);assert.equal(checkpoints,2);
 assert.ok(models.every(url=>url.includes('gemini-3.5-flash-lite')),'Independent evaluator model');
 assert.ok(Object.values(result.evaluations!).every(e=>e.model==='gemini-3.5-flash-lite'));
 assert.ok(keyPaused((await localRepository.keys())[0]));
 assert.equal(secrets[0],'fixture-evaluator-primary');assert.equal(secrets[1],'fixture-evaluator-backup');assert.equal(secrets[2],'fixture-evaluator-backup','Next evaluation group skips the paused primary');
 console.log('PASS: evaluation autosave policy migration, independent model, key failover, pause across groups, final scores and checkpoints. No external calls.');
}finally{globalThis.fetch=original;}

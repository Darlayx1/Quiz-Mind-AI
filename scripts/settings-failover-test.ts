import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRepository } from '../src/workspace/localRepository.js';
import { emptyWorkspace, sanitizeWorkspace, keyPaused } from '../src/workspace/types.js';
import { normalizeEvaluationSettings } from '../src/evaluationSettings.js';
import { validateQuestion } from '../src/questionValidation.js';
import { buildResult } from '../src/scoring.js';
import { evaluateWorkspace } from '../src/workspace/evaluation.js';
import { AISettings } from '../src/components/AISettings.js';
import type { Quiz, QuizSubmission } from '../src/types/quiz.js';
import { fixtures } from './assessment-fixtures.js';
const preferences=emptyWorkspace().preferences;
assert.equal(preferences.effort,'high','Default generator effort is high');
assert.equal(preferences.evaluation?.effort,'high','Default evaluator effort is high');
const extraHydrogen=normalizeEvaluationSettings({...preferences.evaluation,model:'gemini-4-hydrogen',effort:'extra'});
assert.equal(extraHydrogen.effort,'extra','Gemini 4 Hydrogen supports extra effort in evaluator');
const clampedFlash=normalizeEvaluationSettings({...preferences.evaluation,model:'gemini-3.5-flash-lite',effort:'extra'});
assert.equal(clampedFlash.effort,'high','Non-Hydrogen evaluator model clamps extra effort to high');
const sanitizedClamped=sanitizeWorkspace({preferences:{...preferences,model:'gemini-3.8-flash',effort:'extra'}});
assert.equal(sanitizedClamped.preferences.effort,'high','Non-Hydrogen generator model clamps extra effort to high');
const settings=normalizeEvaluationSettings({...preferences.evaluation,model:'gemini-3.5-flash-lite',effort:'medium',followGenerator:true,enabled:false,allowKeyFallback:true,allowModelFallback:true,allowProviderFallback:true});
assert.equal(settings.enabled,true);assert.equal(settings.followGenerator,false);assert.equal(settings.effort,'medium');assert.equal(settings.allowKeyFallback,false);assert.equal(settings.allowModelFallback,false);assert.equal(settings.allowProviderFallback,false);
// Verify UI renders Effort dropdowns for both Quiz Generator and Quiz Evaluator, with Extra only on Gemini 4 Hydrogen
const hydrogenWorkspace = emptyWorkspace();
hydrogenWorkspace.preferences.effort = 'extra';
hydrogenWorkspace.preferences.evaluation = normalizeEvaluationSettings({ ...hydrogenWorkspace.preferences.evaluation, model: 'gemini-4-hydrogen', effort: 'extra' });
const hydrogenUi = renderToStaticMarkup(createElement(AISettings, {
  workspace: { keys: [], scope: 'guest', mode: 'guest', ready: true, data: hydrogenWorkspace } as any,
  initialTab: 'models', onClose() {}, onSelectQuiz() {}
}));
assert.ok(hydrogenUi.includes('id="settings-effort"'), 'Generator effort control present');
assert.ok(hydrogenUi.includes('id="eval-effort"'), 'Evaluator effort control present');
assert.equal((hydrogenUi.match(/<span>Extra<\/span>/g) || []).length, 2, 'Extra selected and displayed for both generator and evaluator when Gemini 4 Hydrogen is active');
const flashWorkspace = emptyWorkspace();
flashWorkspace.preferences.model = 'gemini-3.8-flash';
flashWorkspace.preferences.effort = 'extra' as any;
flashWorkspace.preferences.evaluation = normalizeEvaluationSettings({ ...flashWorkspace.preferences.evaluation, model: 'gemma-4-31b-it', effort: 'extra' });
const flashUi = renderToStaticMarkup(createElement(AISettings, {
  workspace: { keys: [], scope: 'guest', mode: 'guest', ready: true, data: flashWorkspace } as any,
  initialTab: 'models', onClose() {}, onSelectQuiz() {}
}));
assert.equal((flashUi.match(/<span>Extra<\/span>/g) || []).length, 0, 'Extra clamped to High when neither generator nor evaluator uses Gemini 4 Hydrogen');
assert.equal((flashUi.match(/<span>High<\/span>/g) || []).length, 2, 'Both controls display clamped High');
assert.equal(sanitizeWorkspace({preferences:{...preferences,fallback:true,allowGroundingFallback:true,evaluation:settings}}).preferences.fallback,false);
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
 await assert.rejects(
   evaluateWorkspace(buildResult(quiz,submission,undefined,settings),undefined,{...preferences,keyId:keys[0].id,fallback:true},keys,localRepository,new AbortController().signal,async()=>{checkpoints++;}),
   (err:any)=>Number(err?.status)===429 || /Quota/i.test(String(err?.message))
 );
 assert.equal(calls,1,'Should fail immediately without key failover');
 assert.equal(checkpoints,0);
 assert.deepEqual(secrets,['fixture-evaluator-primary']);
 assert.ok(keyPaused((await localRepository.keys())[0]));
 // Manual retry after primary key is paused uses the remaining active key.
 const result=await evaluateWorkspace(buildResult(quiz,submission,undefined,settings),undefined,{...preferences,keyId:keys[0].id,fallback:false},keys,localRepository,new AbortController().signal,async()=>{checkpoints++;});
 assert.equal(result.finalScore,100);assert.equal(calls,3);assert.equal(checkpoints,2);
 assert.ok(models.every(url=>url.includes('gemini-3.5-flash-lite')),'Independent evaluator model');
 assert.ok(Object.values(result.evaluations!).every(e=>e.model==='gemini-3.5-flash-lite'));
 assert.equal(secrets[1],'fixture-evaluator-backup');assert.equal(secrets[2],'fixture-evaluator-backup');
 console.log('PASS: evaluation autosave policy migration, independent model, no automatic key failover, pause across manual retries, final scores and checkpoints. No external calls.');
}finally{globalThis.fetch=original;}

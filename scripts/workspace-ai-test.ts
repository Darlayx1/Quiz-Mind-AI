import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { localRepository } from '../src/workspace/localRepository.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { generateWorkspaceQuiz } from '../src/workspace/ai.js';
import { evaluateWorkspace } from '../src/workspace/evaluation.js';
import { QUESTION_TYPES } from '../src/types/quiz.js';
import { buildResult } from '../src/scoring.js';
import { fixtures } from './assessment-fixtures.js';
import { qualityReviewFixture } from './quality-review-fixture.js';
import { streamingFixtureFetch } from './stream-fixture.js';

const originalFetch=globalThis.fetch;
let rejectedKeyCalls=0,acceptedCalls=0,generatedCalls=0;
await localRepository.load();
await localRepository.putKey({label:'Invalid fixture',secret:'invalid-fixture-key'});
await localRepository.putKey({label:'Working fixture',secret:'working-fixture-key'});
globalThis.fetch=async(input,init)=>{
 const request=new Request(input,init),body=await request.json(),key=request.headers.get('x-goog-api-key')??new URL(request.url).searchParams.get('key');
 if(key==='invalid-fixture-key'){rejectedKeyCalls++;return Response.json({error:{code:401,message:'API_KEY_INVALID'}},{status:401});}
 acceptedCalls++;
 const prompt=body.contents.map((c:any)=>c.parts.map((p:any)=>p.text??'').join('\n')).join('\n');
 const quality=qualityReviewFixture(prompt);
 if(quality){return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(quality)}]}}]});}
 let output:unknown;
 if(prompt.includes('SCHEMA:')&&prompt.includes('DATA:')){
  const payload=JSON.parse(prompt.slice(prompt.indexOf('DATA: ')+6));
  output={results:payload.map((q:any)=>({questionId:q.questionId,criteria:q.rubric.map((c:any)=>({criterionId:c.id,level:1,evidence:'Konsep',feedback:'Konsep sesuai rubrik.'})),feedback:'Jawaban tepat.',reviewFlags:[]}))};
 }else{
  generatedCalls++;
  output={title:'Mixed fixture',summary:'Test',questions:QUESTION_TYPES.map((type,i)=>({...fixtures[type],type,question:`${type} ${acceptedCalls} ${i}: Pertanyaan konsep?`}))};
 }
 return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(output)}]}}]});
};
globalThis.fetch=streamingFixtureFetch(globalThis.fetch);
try{
 const prefs={...emptyWorkspace().preferences,grounding:false};
 const config={topic:'Konsep',difficulty:'easy' as const,questionCount:7,questionDistribution:Object.fromEntries(QUESTION_TYPES.map(t=>[t,1])),timeLimitMinutes:0,language:'id' as const,enableGrounding:false,pointsByType:{essay:5}};
 await assert.rejects(
  generateWorkspaceQuiz(config,prefs,await localRepository.keys(),localRepository,async()=>{},new AbortController().signal),
  (e:any)=>e.status===401
 );
 assert.equal(rejectedKeyCalls,1,'Invalid key must terminate immediately without falling back');
 const workingKeys=(await localRepository.keys()).filter(k=>k.label==='Working fixture');
 const quiz=await generateWorkspaceQuiz(config,prefs,workingKeys,localRepository,async()=>{},new AbortController().signal);
 assert.equal(quiz.questions.length,7);
 assert.deepEqual(quiz.questions.map(q=>q.type),QUESTION_TYPES);
 assert.equal(quiz.questions.find(q=>q.type==='essay')!.maxPoints,5);
 assert.equal(generatedCalls,1,'Single call generates all mixed questions');
 const settings={...prefs.evaluation!,shortAnswerMode:'ai' as const};
 const answers=Object.fromEntries(quiz.questions.filter(q=>q.type==='short_answer'||q.type==='essay').map(q=>[q.id,{type:q.type,text:'Konsep sesuai jawaban.'}]));
 const submission={quizId:quiz.id,attemptId:crypto.randomUUID(),userAnswers:answers,bookmarkedQuestions:[],timeTakenSeconds:1,completedAt:new Date().toISOString()};
 const result=buildResult(quiz,submission,undefined,settings);
 const keys=(await localRepository.keys()).filter(k=>k.status==='available');
 const evaluated=await evaluateWorkspace(result,undefined,prefs,keys,localRepository,new AbortController().signal,async()=>{});
 assert.equal(evaluated.pendingCount,0);
 assert.equal(evaluated.evaluations![quiz.questions.find(q=>q.type==='essay')!.id].earnedPoints,5);
 assert.equal(generatedCalls,1);
 assert.equal(acceptedCalls,2,'One generation call and one evaluation call.');
 console.log('PASS: mixed single-call generation, fixed model, terminal invalid-key, essay weighting, scoped evaluator, bounded calls. No external API requests.');
}finally{globalThis.fetch=originalFetch;}

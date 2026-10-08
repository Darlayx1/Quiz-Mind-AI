import assert from 'node:assert/strict';
import { QUESTION_TYPES,type Quiz,type QuizSubmission,type QuestionType } from '../src/types/quiz.js';
import { validateQuestion } from '../src/questionValidation.js';
import { answerProgress,validateAnswer } from '../src/questionState.js';
import { scoreQuestion,buildResult } from '../src/scoring.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import { migrateHistory } from '../src/quizStorage.js';
import { KeyPool,defaultSettings } from '../src/keyPool.js';
import { generateQuiz } from '../src/server/aiService.js';
import { evaluateQuiz,parseEvaluationOutput,validateEvaluationRequest } from '../src/server/evaluationService.js';
import { fixtures } from './assessment-fixtures.js';
const questions=QUESTION_TYPES.map((type,i)=>validateQuestion({...fixtures[type],id:'q'+i},i,'Konsep',[],type)!);
assert.ok(questions.every(Boolean));
const quiz:Quiz={id:'quiz-fixture',schemaVersion:2,title:'Campuran',topic:'Konsep',summary:'Latihan',difficulty:'easy',timeLimitMinutes:0,createdAt:new Date().toISOString(),questions,provider:'gemini',model:defaultEvaluationSettings.model};
const submission:QuizSubmission={quizId:quiz.id,attemptId:'attempt-fixture',userAnswers:{q0:{type:'single_choice',selectedOptionId:'o0'},q1:{type:'multiple_select',selectedOptionIds:['o2','o0']},q2:{type:'true_false',value:false},q3:{type:'short_answer',text:' empat '},q4:{type:'essay',text:'Jawaban konsep saya lengkap dengan penalaran.'},q5:{type:'matching',pairs:{l1:'r1',l2:'r2'}},q6:{type:'ordering',orderedItemIds:['i1','i2','i3'],confirmed:false}},bookmarkedQuestions:[],timeTakenSeconds:0,completedAt:new Date().toISOString()};
assert.equal(answerProgress(questions[2],submission.userAnswers.q2),'complete');
assert.equal(answerProgress(questions[5],submission.userAnswers.q5),'partial');
assert.equal(answerProgress(questions[6],submission.userAnswers.q6),'unanswered');
assert.equal(scoreQuestion(questions[0],0).earnedPoints,1);
assert.equal(scoreQuestion(questions[0],-1).status,'unanswered');
assert.equal(scoreQuestion(questions[3],submission.userAnswers.q3).earnedPoints,1);
assert.equal(scoreQuestion(questions[3],{type:'short_answer',text:'Negasi atau jawaban alternatif'}).status,'pending');
assert.equal(scoreQuestion(questions[4],submission.userAnswers.q4).earnedPoints,null);
assert.equal(validateAnswer(questions[2],{type:'true_false',value:'false'} as any),false);
assert.equal(validateAnswer(questions[1],{type:'multiple_select',selectedOptionIds:['o0','o0']}),false);
assert.equal(validateAnswer(questions[5],{type:'matching',pairs:{l1:'r1',l2:'r1'}}),false);
assert.equal(validateAnswer(questions[6],{type:'ordering',orderedItemIds:['i1','i1','i3'],confirmed:true}),false);
assert.equal(validateQuestion({...fixtures.single_choice,options:['A','B','C','D']},0,'t'),null);
assert.equal(validateQuestion({...fixtures.multiple_select,correctAnswerIndices:[0,0]},0,'t',[],'multiple_select'),null);
assert.equal(validateQuestion({...fixtures.essay,rubric:[{id:'x',description:'a',weight:100,anchors:['a','b','c']}]},0,'t',[],'essay'),null);
assert.throws(()=>normalizeQuizConfig({topic:'t',questionCount:3,questionDistribution:{essay:2}}));
assert.throws(()=>normalizeQuizConfig({topic:'t',questionCount:1,questionDistribution:{essay:1.5}}));
const result=buildResult(quiz,submission);assert.equal(result.finalScore,null);assert.equal(result.partialCount,1);assert.equal(result.pendingCount,1);assert.equal(result.unansweredCount,1);
const partial={...questions[1],scoringMode:'partial' as const};assert.equal(scoreQuestion(partial,{type:'multiple_select',selectedOptionIds:['o0','o1','o2','o3','o4']}).earnedPoints,0);
for(let mask=0;mask<32;mask++){const ids=Array.from({length:5},(_,i)=>'o'+i).filter((_,i)=>mask&(1<<i)),e=scoreQuestion(partial,{type:'multiple_select',selectedOptionIds:ids});assert.ok(e.earnedPoints!>=0&&e.earnedPoints!<=1);}
const old={...quiz,schemaVersion:undefined,questions:[{...fixtures.single_choice,id:'old',options:['A','B','C','D'],groundingSources:[]}]};
const migrated=migrateHistory([{quiz:old,savedAt:'2026-01-01'}]);assert.equal(migrated[0].quiz.questions[0].options?.length,4);assert.deepEqual(migrateHistory(migrated),migrated);
const originalFetch=globalThis.fetch;let calls:any[]=[],mode='ok',serial=0;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init);req.signal.throwIfAborted();const body=await req.json(),groq=req.url.includes('groq.com');calls.push(body);
 if(mode==='error')return Response.json({error:{code:500,status:'INTERNAL',message:'Fixture provider error'}},{status:500});
 const prompt=groq?body.messages.at(-1).content:body.contents?.[0]?.parts?.map((p:any)=>p.text??'').join('\n')??'';
 let value:any;
 if(prompt.includes('DATA: ')){const data=JSON.parse(prompt.split('DATA: ').at(-1));value={results:data.map((q:any)=>({questionId:q.questionId,criteria:q.rubric.map((c:any)=>({criterionId:c.id,level:mode==='invalid'?2:1,evidence:q.answer.text.slice(0,40),feedback:'Konsep terpenuhi.'})),feedback:'Jawaban memenuhi rubrik.',reviewFlags:mode==='review'?['Perlu tinjauan acuan']:[]}))};}
 else if(body.tools?.[0]?.type==='browser_search')return Response.json({choices:[{message:{content:'Fakta ilmiah hasil pencarian.'},finish_reason:'stop'}]});
 else{const type=(/Tipe: (\w+)/.exec(prompt)?.[1]??'single_choice') as QuestionType,count=Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]??1);value={title:'Kuis campuran',topic:'Konsep',summary:'Latihan',questions:Array.from({length:count},()=>({...fixtures[type],question:'Pertanyaan unik nomor '+(++serial)+' tentang konsep?'}))};}
 const content=JSON.stringify(value);return groq?Response.json({choices:[{message:{content},finish_reason:'stop'}]}):Response.json({candidates:[{content:{role:'model',parts:[{text:content}]}}]});
};
const makePool=(provider:'gemini'|'groq'='gemini')=>new KeyPool({keys:[{id:provider,name:'Fixture',provider,key:'fake-only-'+provider,project:'fixture',priority:1,enabled:true}],settings:{...defaultSettings}});
try{
 for(const provider of ['gemini','groq'] as const){const pool=makePool(provider);calls=[];const generated=await generateQuiz({provider,topic:'Konsep',difficulty:'easy',questionCount:7,questionDistribution:Object.fromEntries(QUESTION_TYPES.map(t=>[t,1])),timeLimitMinutes:0,language:'id',enableGrounding:false},undefined,{pool});assert.equal(generated.questions.length,7);assert.deepEqual(generated.questions.map(q=>q.type),QUESTION_TYPES);assert.ok(generated.questions.every(q=>q.maxPoints===1));pool.lock();}
 const req={quiz,submission,settings:{...defaultEvaluationSettings,shortAnswerMode:'ai' as const},targetQuestionIds:['q4']};const pool=makePool();calls=[];const evaluated=await evaluateQuiz(req,{pool});assert.equal(evaluated.q4.status,'graded');assert.equal(evaluated.q4.earnedPoints,1);assert.equal(calls.length,1);assert.ok(calls.every(b=>!b.tools));await evaluateQuiz(req,{pool});assert.equal(calls.length,1,'Same snapshot should use cache');
 await evaluateQuiz({...req,previous:{q4:evaluated.q4}},{pool});assert.equal(calls.length,2,'New revision should evaluate again');pool.lock();
 mode='review';const review=await evaluateQuiz(req,{pool:makePool()});assert.equal(review.q4.status,'needs_review');assert.equal(review.q4.earnedPoints,null);assert.equal(review.q4.proposedPoints,1);
 mode='invalid';const invalid=await evaluateQuiz(req,{pool:makePool()});assert.equal(invalid.q4.status,'failed');assert.equal(invalid.q4.earnedPoints,null);
 mode='error';calls=[];const failed=await evaluateQuiz(req,{pool:makePool()});assert.equal(failed.q4.status,'failed');assert.ok(calls.length<=3);assert.ok(failed.q4.attemptCount!<=3);
 await assert.rejects(evaluateQuiz({...req,previous:{q4:{...failed.q4,attemptCount:3}}},{pool:makePool()}),/Tiga percobaan/);
 mode='ok';const disabledFallback={...req,settings:{...defaultEvaluationSettings,followGenerator:false,provider:'groq' as const,model:'openai/gpt-oss-120b',shortAnswerMode:'ai' as const}};calls=[];const unavailable=await evaluateQuiz(disabledFallback,{pool:makePool()});assert.equal(unavailable.q4.status,'failed');assert.equal(calls.length,0);
 assert.throws(()=>validateEvaluationRequest({...req,targetQuestionIds:['q0']}));
 assert.throws(()=>parseEvaluationOutput({results:[{questionId:'q4',criteria:[],feedback:'x',reviewFlags:[]}]},[questions[4]],submission.userAnswers,defaultEvaluationSettings));
 console.log('PASS: seven types, five-option validation, scoring invariants, legacy migration, mixed generation Gemini/Groq, evaluator cache/revisions/review/failure/budget/fallback.');
}finally{globalThis.fetch=originalFetch;}

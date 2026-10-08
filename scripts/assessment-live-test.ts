import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL } from '../src/models.js';
import { generateQuiz } from '../src/server/aiService.js';
import { KeyPool,defaultSettings } from '../src/keyPool.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import { evaluateQuiz } from '../src/server/evaluationService.js';
import type { QuizSubmission } from '../src/types/quiz.js';
dotenv.config({quiet:true});
const key=process.env.GEMINI_API_KEY;
if(!key||key.startsWith('MY_')){console.log('SKIP: Gemini key belum dikonfigurasi; tidak ada panggilan API.');process.exit(0);}
const pool=new KeyPool({keys:[{id:'live-test',provider:'gemini',name:'Live smoke',project:'',key,priority:1,enabled:true}],settings:{...defaultSettings}});
const signal=AbortSignal.timeout(240000),settings={...defaultEvaluationSettings,shortAnswerMode:'ai' as const};
try{
 console.log('LIVE: Membuat 1 isian dan 1 esai singkat melalui Gemini; menggunakan kuota.');
 const quiz=await generateQuiz({provider:'gemini',model:process.env.ASSESSMENT_TEST_MODEL??DEFAULT_MODEL,topic:'Penjumlahan bilangan bulat: 2 ditambah 2',difficulty:'easy',questionCount:2,questionDistribution:{short_answer:1,essay:1},timeLimitMinutes:0,language:'id',enableGrounding:false,evaluationSettings:settings},undefined,{pool,signal});
 assert.equal(quiz.schemaVersion,2);assert.equal(quiz.questions.length,2);
 const submission:QuizSubmission={quizId:quiz.id,attemptId:crypto.randomUUID(),userAnswers:Object.fromEntries(quiz.questions.map(q=>{assert.ok(q.type==='short_answer'||q.type==='essay');return [q.id,{type:q.type,text:q.referenceAnswer}];})),bookmarkedQuestions:[],timeTakenSeconds:0,completedAt:new Date().toISOString()};
 for(const question of quiz.questions){const result=await evaluateQuiz({quiz,submission,settings,targetQuestionIds:[question.id]},{pool,signal});const e=result[question.id];assert.equal(e.status,'graded',e.feedback);assert.equal(e.earnedPoints,e.maxPoints,'Jawaban acuan harus mendapat semua poin');console.log('PASS LIVE: '+question.type+' · '+e.model+' · '+e.earnedPoints+'/'+e.maxPoints);}
 console.log('PASS LIVE: generator dan evaluator nyata berjalan; tanpa pencarian web atau fallback.');
}catch(error:any){console.error('LIVE FAILED:',error.code??error.name,error.status??'');console.error('Safe provider health:',JSON.stringify([...pool.health.values()].map(h=>({state:h.state,reason:h.reason,scope:h.scope,failures:h.failures}))));process.exitCode=1;}finally{pool.lock();}

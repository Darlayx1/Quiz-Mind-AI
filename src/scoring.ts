import type { EvaluationSettings,Question,QuestionEvaluation,Quiz,QuizResult,QuizSubmission } from './types/quiz.js';
import { answerProgress,normalizedAnswer,optionIds,validateAnswer } from './questionState.js';
export const maxPoints=(q:Question)=>q.maxPoints??1;
export function scoreQuestion(q:Question,raw:QuizSubmission['userAnswers'][string]|undefined,settings?:EvaluationSettings):QuestionEvaluation {
 if(!validateAnswer(q,raw))throw new Error('Jawaban tidak cocok dengan soal: '+q.id);
 const max=maxPoints(q),a=normalizedAnswer(q,raw),base:QuestionEvaluation={questionId:q.id,status:'graded',method:'deterministic',earnedPoints:0,maxPoints:max,feedback:q.explanation};
 if(answerProgress(q,raw)==='unanswered')return {...base,status:'unanswered',feedback:'Tidak ada jawaban.'};
 let ratio=0;
 if((q.type===undefined||q.type==='single_choice')&&a?.type==='single_choice')ratio=+(a.selectedOptionId===optionIds(q)[q.correctAnswerIndex]);
 else if(q.type==='multiple_select'&&a?.type==='multiple_select'){const correct=a.selectedOptionIds.filter(id=>q.correctOptionIds.includes(id)).length,wrong=a.selectedOptionIds.length-correct;ratio=q.scoringMode==='partial'?Math.max(0,correct/q.correctOptionIds.length-wrong/(5-q.correctOptionIds.length)):+(wrong===0&&correct===q.correctOptionIds.length);}
 else if(q.type==='true_false'&&a?.type==='true_false')ratio=+(a.value===q.correctValue);
 else if(q.type==='matching'&&a?.type==='matching')ratio=q.leftItems.filter(i=>a.pairs[i.id]===q.correctPairs[i.id]).length/q.leftItems.length;
 else if(q.type==='ordering'&&a?.type==='ordering'){if(q.scoringMode==='exact')ratio=+q.correctOrder.every((id,i)=>a.orderedItemIds[i]===id);else{let correct=0;for(let i=0;i<q.correctOrder.length;i++)for(let j=i+1;j<q.correctOrder.length;j++)if(a.orderedItemIds.indexOf(q.correctOrder[i])<a.orderedItemIds.indexOf(q.correctOrder[j]))correct++;ratio=correct/(q.items.length*(q.items.length-1)/2);}}
 else if(q.type==='short_answer'&&a?.type==='short_answer'&&settings?.shortAnswerMode!=='ai'){const norm=(s:string)=>{const v=s.normalize('NFC').trim().replace(/\s+/g,' ');return q.caseSensitive?v:v.toLocaleLowerCase();};if(q.acceptedAnswers.some(s=>norm(s)===norm(a.text)))ratio=1;else return {...base,status:'pending',method:'ai',earnedPoints:null,feedback:'Menunggu evaluasi AI.'};}
 else if(q.type==='short_answer'||q.type==='essay')return {...base,status:'pending',method:'ai',earnedPoints:null,feedback:'Menunggu evaluasi AI.'};
 return {...base,earnedPoints:Math.round(ratio*max*10000)/10000};
}
export function buildResult(quiz:Quiz,submission:QuizSubmission,existing?:Record<string,QuestionEvaluation>,settings?:EvaluationSettings):QuizResult {
 const evaluations=Object.fromEntries(quiz.questions.map(q=>[q.id,existing?.[q.id]??scoreQuestion(q,submission.userAnswers[q.id],settings)])),values=Object.values(evaluations),done=(e:QuestionEvaluation)=>e.earnedPoints!==null&&['graded','unanswered'].includes(e.status);
 const pendingCount=values.filter(e=>!done(e)).length,correctCount=values.filter(e=>done(e)&&e.status==='graded'&&e.earnedPoints===e.maxPoints).length,partialCount=values.filter(e=>done(e)&&e.earnedPoints!>0&&e.earnedPoints!<e.maxPoints).length,unansweredCount=values.filter(e=>e.status==='unanswered').length,incorrectCount=values.filter(e=>e.status==='graded'&&e.earnedPoints===0).length;
 const earnedPoints=values.reduce((n,e)=>n+(done(e)?e.earnedPoints!:0),0),totalPoints=values.reduce((n,e)=>n+e.maxPoints,0),score=Math.round(earnedPoints/totalPoints*10000)/100;
 return {quiz,submission,evaluations,score,finalScore:pendingCount?null:score,earnedPoints,totalPoints,correctCount,partialCount,incorrectCount,unansweredCount,pendingCount,status:pendingCount?'partial':'completed',accuracyPercentage:Math.round(correctCount/quiz.questions.length*100),evaluationSettings:settings,evaluationAnalysis:pendingCount?`${pendingCount} soal belum memperoleh nilai final. Poin terkonfirmasi tetap tersimpan.`:score>=70?'Pemahaman Anda sudah baik. Tinjau pembahasan untuk memperkuat konsep.':'Gunakan pembahasan dan rubrik untuk menentukan materi yang perlu dipelajari kembali.'};
}

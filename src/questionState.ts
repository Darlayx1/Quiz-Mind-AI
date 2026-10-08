import type { AnswerValue,Question,QuestionType,StoredAnswer } from './types/quiz.js';
export const questionLabels:Record<QuestionType,string>={single_choice:'Pilihan ganda',multiple_select:'Pilihan ganda kompleks',true_false:'Benar atau salah',short_answer:'Isian singkat',essay:'Esai',matching:'Menjodohkan',ordering:'Mengurutkan'};
export const questionType=(q:Question):QuestionType=>q.type??'single_choice';
export const optionIds=(q:Question)=>q.type===undefined||q.type==='single_choice'||q.type==='multiple_select'?q.optionIds??q.options.map((_,i)=>'o'+i):[];
export function normalizedAnswer(q:Question,raw?:StoredAnswer):AnswerValue|undefined {
 if(typeof raw==='number') return (q.type===undefined||q.type==='single_choice')&&Number.isInteger(raw)&&raw>=0&&raw<q.options.length?{type:'single_choice',selectedOptionId:optionIds(q)[raw]}:undefined;
 return raw;
}
export function answerProgress(q:Question,raw?:StoredAnswer):'unanswered'|'partial'|'complete' {
 const a=normalizedAnswer(q,raw); if(!a||a.type!==questionType(q))return 'unanswered';
 switch(a.type){
 case 'single_choice':return a.selectedOptionId===null?'unanswered':'complete';
 case 'multiple_select':return a.selectedOptionIds.length?'complete':'unanswered';
 case 'true_false':return a.value===null?'unanswered':'complete';
 case 'short_answer':case 'essay':return a.text.trim()?'complete':'unanswered';
 case 'matching':{const n=Object.keys(a.pairs).length;return !n?'unanswered':q.type==='matching'&&n===q.leftItems.length?'complete':'partial';}
 case 'ordering':return a.confirmed?'complete':'unanswered';
 }
}
export function validateAnswer(q:Question,raw?:StoredAnswer):boolean {
 if(raw===undefined||raw===-1)return true;
 const a=normalizedAnswer(q,raw);if(!a||typeof a!=='object'||a.type!==questionType(q))return false;
 switch(a.type){
 case 'single_choice':return a.selectedOptionId===null||optionIds(q).includes(a.selectedOptionId);
 case 'multiple_select':return Array.isArray(a.selectedOptionIds)&&new Set(a.selectedOptionIds).size===a.selectedOptionIds.length&&a.selectedOptionIds.every(id=>optionIds(q).includes(id));
 case 'true_false':return a.value===null||typeof a.value==='boolean';
 case 'short_answer':case 'essay':return typeof a.text==='string'&&(q.type==='short_answer'||q.type==='essay')&&a.text.length<=q.maxLength;
 case 'matching':return q.type==='matching'&&!!a.pairs&&typeof a.pairs==='object'&&!Array.isArray(a.pairs)&&Object.entries(a.pairs).every(([l,r])=>q.leftItems.some(i=>i.id===l)&&q.rightItems.some(i=>i.id===r))&&new Set(Object.values(a.pairs)).size===Object.keys(a.pairs).length;
 case 'ordering':return q.type==='ordering'&&typeof a.confirmed==='boolean'&&Array.isArray(a.orderedItemIds)&&a.orderedItemIds.length===q.items.length&&new Set(a.orderedItemIds).size===q.items.length&&a.orderedItemIds.every(id=>q.items.some(i=>i.id===id));
 }
}
export const hasOpenQuestions=(questions:Question[])=>questions.some(q=>q.type==='short_answer'||q.type==='essay');

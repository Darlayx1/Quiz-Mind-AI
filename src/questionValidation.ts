import type { GroundingSource,Item,Question,QuestionType } from './types/quiz.js';
import { QUESTION_TYPES } from './types/quiz.js';
const str={type:'string'},int={type:'integer'},strings={type:'array',items:str};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const itemSchema=object({id:str,text:str});
const items={type:'array',items:itemSchema,minItems:3,maxItems:8};
export function questionSchema(type:QuestionType){
 const common={question:str,explanation:str,topicCategory:str,referenceTitle:str};
 const specific:Record<QuestionType,Record<string,unknown>>={
 single_choice:{options:{...strings,minItems:5,maxItems:5},correctAnswerIndex:{...int,minimum:0,maximum:4}},
 multiple_select:{options:{...strings,minItems:5,maxItems:5},correctAnswerIndices:{type:'array',items:{...int,minimum:0,maximum:4},minItems:2,maxItems:4}},
 true_false:{correctValue:{type:'boolean'}},
 short_answer:{referenceAnswer:str,acceptedAnswers:strings,requiredConcepts:strings,caseSensitive:{type:'boolean'},allowPartial:{type:'boolean'}},
 essay:{referenceAnswer:str,rubric:{type:'array',minItems:3,maxItems:5,items:object({id:str,description:str,weight:{type:'number'},anchors:{...strings,minItems:3,maxItems:3}})}},
 matching:{leftItems:items,rightItems:items,correctPairs:{type:'array',items:object({leftId:str,rightId:str})}},
 ordering:{items,correctOrder:strings}
 };
 return object({...common,...specific[type]});
}
export function quizSchemaFor(type:QuestionType='single_choice'){return object({title:str,topic:str,summary:str,questions:{type:'array',items:questionSchema(type)}});}
export const typeInstructions:Record<QuestionType,string>={
 single_choice:'Exactly 5 unique options A–E; one correctAnswerIndex integer 0–4.',
 multiple_select:'Exactly 5 unique options A–E; correctAnswerIndices contains 2–4 unique indices 0–4. Each correct option is independently true.',
 true_false:'One unambiguous statement. correctValue is a JSON boolean.',
 short_answer:'A brief answer. Provide referenceAnswer, 1–10 acceptedAnswers, 1–10 requiredConcepts, caseSensitive boolean, allowPartial boolean. Keep negation, numbers and units meaningful.',
 essay:'Provide a referenceAnswer and rubric with 3–5 criteria. Each criterion has unique id, description, positive weight; weights sum to 100. anchors contains exactly 3 descriptions for scores 0 (missing), 0.5 (partial), 1 (fulfilled).',
 matching:'3–8 unique items on each side, equal counts. IDs use l1/l2... and r1/r2...; correctPairs array contains each leftId and rightId once. Correspondence must be one-to-one and unambiguous.',
 ordering:'3–8 unique items with neutral stable IDs i1/i2... and one unambiguous order; correctOrder is a complete permutation of item IDs. Shuffle items so initial order does not reveal the key.'
};
const text=(v:unknown,max=10000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
const safeId=(v:unknown):v is string=>text(v,100)&&/^[\w-]+$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const validItems=(v:unknown):v is Item[]=>Array.isArray(v)&&v.length>=3&&v.length<=8&&v.every(i=>i&&safeId(i.id)&&text(i.text,1500))&&new Set(v.map(i=>i.id)).size===v.length&&new Set(v.map(i=>i.text.normalize('NFC').trim().toLocaleLowerCase())).size===v.length;
const validTexts=(v:unknown,min=1,max=10):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(s=>text(s,500));
export function validateQuestion(raw:unknown,idx:number,topic:string,sources:GroundingSource[]=[],expected:QuestionType='single_choice',legacy=false):Question|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!QUESTION_TYPES.includes(expected))return null;
 const q=raw as Record<string,any>;
 if(q.id!==undefined&&!safeId(q.id))return null;
 if(q.type!==undefined&&q.type!==expected||!text(q.question)||q.question.trim().length<5||!text(q.explanation))return null;
 if(q.maxPoints!==undefined&&(!Number.isInteger(q.maxPoints)||q.maxPoints<1||q.maxPoints>20))return null;
 const base={id:text(q.id,100)?q.id:'q_'+crypto.randomUUID(),question:q.question.trim(),explanation:q.explanation.trim(),topicCategory:text(q.topicCategory,300)?q.topicCategory:topic,maxPoints:q.maxPoints??1,groundingSources:sources.filter(s=>s&&typeof s.url==='string'&&/^https?:\/\//i.test(s.url)).slice(0,3)};
 if(typeof q.referenceTitle==='string'&&q.referenceTitle.trim())base.groundingSources.push({title:q.referenceTitle.trim().slice(0,500),url:''});
 if(expected==='single_choice'||expected==='multiple_select'){
 if(!Array.isArray(q.options)||!q.options.every((v:unknown)=>text(v,2000))||!([5,...legacy&&expected==='single_choice'?[4]:[]].includes(q.options.length))||new Set(q.options.map((s:string)=>s.normalize('NFC').trim().toLocaleLowerCase())).size!==q.options.length)return null;
 const options=q.options.map((s:string)=>s.trim()),optionIds=Array.isArray(q.optionIds)?q.optionIds:options.map((_:string,i:number)=>'o'+i);
 if(optionIds.length!==options.length||new Set(optionIds).size!==optionIds.length||!optionIds.every((id:unknown)=>safeId(id)))return null;
 if(expected==='single_choice'){if(!Number.isInteger(q.correctAnswerIndex)||q.correctAnswerIndex<0||q.correctAnswerIndex>=options.length)return null;return {...base,type:'single_choice',options,optionIds,correctAnswerIndex:q.correctAnswerIndex};}
 const keys=q.correctOptionIds??(Array.isArray(q.correctAnswerIndices)?q.correctAnswerIndices.map((i:unknown)=>Number.isInteger(i)?optionIds[i as number]:undefined):undefined);
 if(!Array.isArray(keys)||keys.length<2||keys.length>4||new Set(keys).size!==keys.length||!keys.every(id=>optionIds.includes(id)))return null;
 return {...base,type:'multiple_select',options,optionIds,correctAnswerIndex:-1,correctOptionIds:keys,scoringMode:q.scoringMode==='partial'?'partial':'exact'};
 }
 if(expected==='true_false')return typeof q.correctValue==='boolean'?{...base,type:expected,correctValue:q.correctValue}:null;
 if(expected==='short_answer'){
 if(!text(q.referenceAnswer)||!validTexts(q.acceptedAnswers)||!validTexts(q.requiredConcepts)||typeof q.caseSensitive!=='boolean'||typeof q.allowPartial!=='boolean')return null;
 if(q.maxLength!==undefined&&(!Number.isInteger(q.maxLength)||q.maxLength<1||q.maxLength>500))return null;
 return {...base,type:expected,referenceAnswer:q.referenceAnswer,acceptedAnswers:q.acceptedAnswers,requiredConcepts:q.requiredConcepts,maxLength:q.maxLength??500,caseSensitive:q.caseSensitive,allowPartial:q.allowPartial};
 }
 if(expected==='essay'){
 if(!text(q.referenceAnswer)||!Array.isArray(q.rubric)||q.rubric.length<3||q.rubric.length>5||!q.rubric.every((c:any)=>c&&safeId(c.id)&&text(c.description,1500)&&typeof c.weight==='number'&&Number.isFinite(c.weight)&&c.weight>0&&validTexts(c.anchors,3,3))||new Set(q.rubric.map((c:any)=>c.id)).size!==q.rubric.length||Math.abs(q.rubric.reduce((n:number,c:any)=>n+c.weight,0)-100)>0.001)return null;
 if(q.maxLength!==undefined&&(!Number.isInteger(q.maxLength)||q.maxLength<1||q.maxLength>5000))return null;
 return {...base,type:expected,referenceAnswer:q.referenceAnswer,rubric:q.rubric,maxLength:q.maxLength??5000};
 }
 if(expected==='matching'){
 if(!validItems(q.leftItems)||!validItems(q.rightItems)||q.leftItems.length!==q.rightItems.length)return null;
 if(Array.isArray(q.correctPairs)&&!q.correctPairs.every((p:any)=>p&&safeId(p.leftId)&&safeId(p.rightId)))return null;
 const pairs=Array.isArray(q.correctPairs)?Object.fromEntries(q.correctPairs.map((p:any)=>[p.leftId,p.rightId])):q.correctPairs;
 if(Array.isArray(q.correctPairs)&&q.correctPairs.length!==Object.keys(pairs).length)return null;
 if(!pairs||typeof pairs!=='object'||Array.isArray(pairs)||Object.keys(pairs).length!==q.leftItems.length||new Set(Object.values(pairs)).size!==q.rightItems.length||!q.leftItems.every((i:Item)=>q.rightItems.some((r:Item)=>r.id===pairs[i.id])))return null;
 return {...base,type:expected,leftItems:q.leftItems,rightItems:q.rightItems,correctPairs:pairs};
 }
 if(!validItems(q.items)||!Array.isArray(q.correctOrder)||q.correctOrder.length!==q.items.length||new Set(q.correctOrder).size!==q.items.length||!q.correctOrder.every((id:string)=>q.items.some((i:Item)=>i.id===id)))return null;
 return {...base,type:'ordering',items:q.items,correctOrder:q.correctOrder,scoringMode:q.scoringMode==='partial'?'partial':'exact'};
}

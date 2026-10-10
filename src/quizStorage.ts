import type { Quiz,QuizResult,QuizSubmission,StoredAnswer } from './types/quiz.js';
import { validateQuestion } from './questionValidation.js';
import { questionType,validateAnswer } from './questionState.js';
export interface HistoryItem {quiz:Quiz;lastResult?:QuizResult;results?:QuizResult[];savedAt:string}
export interface Draft {quizId:string;attemptId:string;answers:Record<string,StoredAnswer>;bookmarks:string[];index:number;startedAt:number;deadline:number;submitted?:QuizSubmission}
const HISTORY='quizmind_ai_history_v1';
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(new Error('Penyimpanan browser tidak tersedia.'));return;}
 const request=indexedDB.open('quizmind_quizzes',2);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('data'))request.result.createObjectStore('data');};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Penyimpanan kuis tidak dapat dibuka.'));request.onblocked=()=>reject(new Error('Tutup tab QuizMind lain untuk memperbarui penyimpanan.'));
});}
export async function readData<T>(key:string):Promise<T|undefined>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('data'),r=tx.objectStore('data').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Data kuis belum berhasil dibaca.'));});}
export async function writeData(key:string,value:unknown){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('data','readwrite');tx.objectStore('data').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Data belum tersimpan. Penyimpanan browser mungkin penuh.'));tx.onabort=()=>reject(new Error('Penyimpanan kuis dibatalkan.'));});}
export async function deleteDraft(id:string){const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('data','readwrite');tx.objectStore('data').delete('draft:'+id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Draft belum dihapus.'));});}
export function migrateHistory(raw:unknown):HistoryItem[]{
 if(!Array.isArray(raw))throw new Error('Format riwayat tidak valid. Salinan asli tidak dihapus.');
 return raw.map((item:any)=>{
  const q=item?.quiz;if(!q||q.schemaVersion!==undefined&&q.schemaVersion!==2||typeof q.id!=='string'||!Array.isArray(q.questions)||!q.questions.length||q.questions.length>100)throw new Error('Versi atau struktur riwayat tidak dikenal. Data asli tetap tersimpan.');
  const questions=q.questions.map((v:any,i:number)=>{const out=validateQuestion(v,i,q.topic,v.groundingSources,questionType(v),q.schemaVersion!==2);if(!out)throw new Error('Ada soal riwayat yang rusak. Salinan asli tetap tersimpan.');return out;});
  const quiz={...q,questions};if(new Set(questions.map((v:Quiz['questions'][number])=>v.id)).size!==questions.length)throw new Error('ID soal riwayat berulang.');
  const validateResult=(r:any)=>{if(!r)return r;if(!r.submission||r.submission.quizId!==quiz.id||!r.submission.userAnswers||typeof r.score!=='number'||!Number.isFinite(r.score)||quiz.questions.some((v:Quiz['questions'][number])=>!validateAnswer(v,r.submission.userAnswers[v.id])))throw new Error('Jawaban riwayat tidak valid.');return {...r,quiz};};
  return {...item,quiz,lastResult:validateResult(item.lastResult),results:item.results?.map(validateResult)};
 });
}
export async function loadHistory():Promise<HistoryItem[]>{
 const stored=await readData<unknown>('history').catch(()=>undefined);
 if(stored!==undefined){try{return migrateHistory(stored);}catch(error){await writeData('history-recovery',stored);throw error;}}
 const source=localStorage.getItem(HISTORY);if(!source)return [];
 const items=migrateHistory(JSON.parse(source));await writeData('history',items).catch(()=>{});return items;
}
export async function saveHistoryItems(items:HistoryItem[]){await writeData('history',items);}
export function exportJSON(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

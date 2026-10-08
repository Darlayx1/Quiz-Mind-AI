import React from 'react';
import type { AnswerValue,Item,Question,StoredAnswer } from '../types/quiz.js';
import { normalizedAnswer,optionIds } from '../questionState.js';
export function stableShuffle<T extends {id:string}>(items:T[],seed:string):T[]{
 let state=2166136261;for(const c of seed)state=Math.imul(state^c.charCodeAt(0),16777619);
 const result=[...items];for(let i=result.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;
}
export function QuestionInput({question:q,value,onChange,seed=''}:{question:Question;value?:StoredAnswer;onChange:(value:AnswerValue)=>void;seed?:string}){
 const a=normalizedAnswer(q,value),id='answer-'+q.id;
 if(q.type===undefined||q.type==='single_choice'||q.type==='multiple_select'){
 const ids=optionIds(q),multi=q.type==='multiple_select';
 return <fieldset className="question-options"><legend className="field-help mb-5">{multi?'Pilih semua jawaban yang benar; bisa lebih dari satu.':'Pilih satu jawaban yang paling tepat.'}</legend>{q.options.map((option,i)=>{
 const selected=multi?a?.type==='multiple_select'&&a.selectedOptionIds.includes(ids[i]):a?.type==='single_choice'&&a.selectedOptionId===ids[i];
 return <label key={ids[i]} className={'answer-choice '+(selected?'is-selected':'')}><input type={multi?'checkbox':'radio'} name={id} checked={!!selected} onChange={()=>{if(multi){const current=a?.type==='multiple_select'?a.selectedOptionIds:[];onChange({type:'multiple_select',selectedOptionIds:selected?current.filter(v=>v!==ids[i]):[...current,ids[i]]});}else onChange({type:'single_choice',selectedOptionId:ids[i]});}}/><span className="option-letter">{String.fromCharCode(65+i)}</span><span>{option}</span></label>;
 })}<button type="button" className="topic-chip" onClick={()=>onChange(multi?{type:'multiple_select',selectedOptionIds:[]}:{type:'single_choice',selectedOptionId:null})}>Hapus jawaban</button></fieldset>;
 }
 if(q.type==='true_false')return <fieldset className="question-options"><legend className="field-help">Tentukan apakah pernyataan ini benar atau salah.</legend>{[true,false].map(v=><label key={String(v)} className={'answer-choice '+(a?.type==='true_false'&&a.value===v?'is-selected':'')}><input type="radio" name={id} checked={a?.type==='true_false'&&a.value===v} onChange={()=>onChange({type:'true_false',value:v})}/><span>{v?'Benar':'Salah'}</span></label>)}<button type="button" className="topic-chip" onClick={()=>onChange({type:'true_false',value:null})}>Hapus jawaban</button></fieldset>;
 if(q.type==='short_answer'||q.type==='essay'){
 const text=a?.type==='short_answer'||a?.type==='essay'?a.text:'';
 return <div className="written-answer"><label className="field-label" htmlFor={id}>Jawaban Anda</label>{q.type==='essay'&&<details className="answer-rubric"><summary>Kriteria penilaian</summary><ul>{q.rubric.map(c=><li key={c.id}>{c.description} ({c.weight}%)</li>)}</ul></details>}<textarea id={id} className="field-input" rows={q.type==='essay'?8:2} maxLength={q.maxLength} value={text} onChange={e=>onChange({type:q.type,text:e.target.value})} aria-describedby={id+'-help'}/><p id={id+'-help'} className="field-help">{text.length}/{q.maxLength} karakter · {q.type==='essay'?'Dinilai AI berdasarkan rubrik.':'Jawaban bermakna sama dapat dinilai AI.'}</p><button type="button" className="topic-chip" onClick={()=>onChange({type:q.type,text:''})}>Hapus jawaban</button></div>;
 }
 if(q.type==='matching'){
 const pairs=a?.type==='matching'?a.pairs:{},right=stableShuffle(q.rightItems,q.id+seed);
 return <fieldset className="matching-answer"><legend className="field-help mb-4">Pilih satu pasangan untuk setiap item. Setiap pilihan hanya dipakai sekali.</legend>{q.leftItems.map(item=><div className="matching-row" key={item.id}><label htmlFor={id+'-'+item.id}>{item.text}</label><select className="field-input" id={id+'-'+item.id} value={pairs[item.id]??''} onChange={e=>{const next={...pairs};if(e.target.value)next[item.id]=e.target.value;else delete next[item.id];onChange({type:'matching',pairs:next});}}><option value="">Belum dipasangkan</option>{right.map(r=><option key={r.id} value={r.id} disabled={Object.entries(pairs).some(([l,v])=>l!==item.id&&v===r.id)}>{r.text}</option>)}</select></div>)}<button type="button" className="topic-chip" onClick={()=>onChange({type:'matching',pairs:{}})}>Hapus semua pasangan</button></fieldset>;
 }
 if(q.type!=='ordering')return null;
 const initial=stableShuffle(q.items,q.id+seed),ordered=a?.type==='ordering'?a.orderedItemIds:initial.map(i=>i.id),confirmed=a?.type==='ordering'&&a.confirmed;
 const move=(index:number,delta:number)=>{const next=[...ordered];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange({type:'ordering',orderedItemIds:next,confirmed:true});};
 return <div className="ordering-answer"><p className="field-help">Susun dari awal ke akhir menggunakan tombol Naik/Turun.</p><ol>{ordered.map((itemId,i)=>{const item=q.items.find(v=>v.id===itemId)!;return <li key={itemId}><span className="order-position">{i+1}</span><span className="order-text">{item.text}</span><button type="button" className="topic-chip" disabled={!i} aria-label={'Naikkan '+item.text} onClick={()=>move(i,-1)}>↑ Naik</button><button type="button" className="topic-chip" disabled={i===ordered.length-1} aria-label={'Turunkan '+item.text} onClick={()=>move(i,1)}>↓ Turun</button></li>;})}</ol><div className="key-actions"><button type="button" className="topic-chip" onClick={()=>onChange({type:'ordering',orderedItemIds:ordered,confirmed:true})}>{confirmed?'Urutan sudah dikonfirmasi':'Gunakan urutan ini'}</button><button type="button" className="topic-chip" onClick={()=>onChange({type:'ordering',orderedItemIds:initial.map(i=>i.id),confirmed:false})}>Reset jawaban</button></div><p role="status" className="field-help">{confirmed?'Jawaban urutan tersimpan.':'Belum dijawab. Susun item atau konfirmasi urutan di atas.'}</p></div>;
}

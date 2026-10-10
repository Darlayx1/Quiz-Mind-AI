import type { QuestionType } from '../src/types/quiz.js';
const common={question:'Pertanyaan konsep untuk latihan?',explanation:'Pembahasan yang berdasarkan konsep.',topicCategory:'Dasar',referenceTitle:''};
const leftItems=[1,2,3].map(i=>({id:'l'+i,text:'Konsep '+i})),rightItems=[1,2,3].map(i=>({id:'r'+i,text:'Makna '+i})),items=[1,2,3].map(i=>({id:'i'+i,text:'Langkah '+i}));
export const fixtures:Record<QuestionType,Record<string,unknown>>={
 single_choice:{...common,options:['Satu','Dua','Tiga','Empat','Lima'],correctAnswerIndex:0},
 multiple_select:{...common,options:['A','B','C','D','E'],correctAnswerIndices:[0,2]},
 true_false:{...common,correctValue:false},
 short_answer:{...common,referenceAnswer:'4',acceptedAnswers:['4','Empat'],requiredConcepts:['penjumlahan'],caseSensitive:false,allowPartial:true},
 essay:{...common,referenceAnswer:'Jawaban acuan lengkap.',rubric:[{id:'c1',description:'Ketepatan',weight:40,anchors:['Salah','Sebagian','Benar']},{id:'c2',description:'Cakupan',weight:40,anchors:['Kosong','Sebagian','Lengkap']},{id:'c3',description:'Penalaran',weight:20,anchors:['Tidak ada','Sebagian','Baik']}]},
 matching:{...common,leftItems,rightItems,correctPairs:[1,2,3].map(i=>({leftId:'l'+i,rightId:'r'+i}))},
 ordering:{...common,items,correctOrder:['i1','i2','i3']}
};

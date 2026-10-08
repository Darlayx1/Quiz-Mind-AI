// Local QA only: no generation calls or real API keys. Preferences remain within this preview.
import React,{useState} from 'react';
import { createRoot } from 'react-dom/client';
import { QuizRunner } from '../src/components/QuizRunner.js';
import { QuizCreator } from '../src/components/QuizCreator.js';
import { QuizResults } from '../src/components/QuizResults.js';
import { AIEvaluationSettings } from '../src/components/AIEvaluationSettings.js';
import { fixtures } from './assessment-fixtures.js';
import { QUESTION_TYPES,type Quiz,type QuizResult } from '../src/types/quiz.js';
import { validateQuestion } from '../src/questionValidation.js';
import { buildResult } from '../src/scoring.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import '../src/index.css';
const quiz:Quiz={id:'qa-seven-types',schemaVersion:2,title:'Uji tujuh tipe soal',topic:'Konsep',summary:'Fixture QA lokal tanpa API.',difficulty:'easy',timeLimitMinutes:0,createdAt:new Date().toISOString(),questions:QUESTION_TYPES.map((type,i)=>validateQuestion({...fixtures[type],id:'qa-'+i},i,'Konsep',[],type)!)};
function Preview(){const [view,setView]=useState('creator'),[result,setResult]=useState<QuizResult>(),[attempt,setAttempt]=useState<string|undefined>(undefined),[settings,setSettings]=useState(defaultEvaluationSettings),[request,setRequest]=useState('');
 return <div className="app-frame min-h-screen"><nav className="key-actions p-4 bg-white" aria-label="QA lokal"><strong>QA lokal · tanpa API</strong>{['creator','runner','settings','timer'].map(tab=><button type="button" className="topic-chip" key={tab} onClick={()=>{setAttempt(undefined);setView(tab);}}>{({creator:'Pembuat kuis',runner:'Tujuh tipe',settings:'Evaluasi AI',timer:'Timer 5 detik'} as Record<string,string>)[tab]}</button>)}</nav>{view==='creator'&&<><QuizCreator onGenerate={config=>setRequest(JSON.stringify(config,null,2))} isLoading={false} errorMessage={null} apiKey="" onApiKeyChange={()=>{}} requiresApiKey={false} serverProviders={['gemini']} onOpenConnections={()=>setView('settings')}/>{request&&<pre className="surface section-pad">{request}</pre>}</>}{(view==='runner'||view==='timer')&&<QuizRunner key={attempt} attemptKey={attempt} quiz={view==='timer'?{...quiz,id:'qa-timer',timeLimitMinutes:5/60}:quiz} onSubmit={s=>{setResult(buildResult(quiz,s));setView('results');}} onQuit={()=>setView('creator')}/>} {view==='settings'&&<div className="page-shell surface section-pad"><AIEvaluationSettings value={settings} onSave={async v=>setSettings(v)}/></div>}{view==='results'&&result&&<QuizResults result={result} onRetake={()=>{setAttempt(crypto.randomUUID());setView('runner');}} onNewQuiz={()=>setView('creator')} onReview={(id,points,reason)=>{const e={...result.evaluations!};e[id]={...e[id],status:'graded',method:'manual',earnedPoints:points,manualReason:reason};setResult(buildResult(quiz,result.submission,e));}}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);

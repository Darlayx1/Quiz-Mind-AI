// Local presentation fixtures. No account persistence or provider calls.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionRuntime } from '../src/components/MotionPrimitives.js';
import { TopBar } from '../src/components/TopBar.js';
import { GenerationLoader } from '../src/components/GenerationLoader.js';
import { EvaluationLoader } from '../src/components/EvaluationLoader.js';
import { QuizPreparation } from '../src/components/QuizPreparation.js';
import { QuizRunner } from '../src/components/QuizRunner.js';
import { QuizResults } from '../src/components/QuizResults.js';
import { QuizHistoryView } from '../src/components/QuizHistoryView.js';
import { reviewFixture } from './results-review-fixture.js';
import '../src/index.css';
import '../src/styles/motion.css';

const initial = reviewFixture();
const sections = ['generation', 'evaluation', 'preparation', 'runner', 'results', 'history'] as const;
const labels = ['Generasi', 'Evaluasi', 'Persiapan', 'Pengerjaan', 'Hasil', 'Riwayat'];
function Preview() {
  const [screen, setScreen] = useState<typeof sections[number]>('generation');
  const [completed, setCompleted] = useState(3), [cancelled, setCancelled] = useState(false);
  const [result, setResult] = useState(initial);
  const [history, setHistory] = useState([0, 1, 2].map(index => ({ quiz: { ...initial.quiz, id: `motion-fixture-${index}` }, savedAt: initial.submission.completedAt, lastResult: initial })));
  const processing = screen === 'generation' || screen === 'evaluation';
  return <div className="app-frame min-h-screen">
    <aside aria-label="QA lokal" className="print:hidden" style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, background: '#f2f6fc', fontSize: 12 }}>
      <strong>Preview lokal · tanpa API</strong>{sections.map((section, i) => <button key={section} className="topic-chip" aria-pressed={screen === section} onClick={() => { setScreen(section); setCancelled(false); }}>{labels[i]}</button>)}
      {processing && <><label>Progress <input aria-label="Progress fixture" type="range" min="0" max="10" value={completed} onChange={event => setCompleted(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={cancelled} onChange={event => setCancelled(event.target.checked)} />Membatalkan</label></>}
      {screen === 'results' && <button className="topic-chip" onClick={() => setResult(reviewFixture('pending'))}>Hasil belum final</button>}
    </aside>
    {screen !== 'runner' && <TopBar activeView={screen === 'history' ? 'history' : screen === 'results' ? 'results' : screen === 'preparation' ? 'preparation' : 'configuration'}
      processingMode={processing ? screen === 'generation' ? 'generation' : 'evaluation' : undefined}
      pageTitle={screen === 'generation' ? 'Membuat Kuis' : screen === 'evaluation' ? 'Evaluasi Jawaban' : 'Persiapan Kuis'}
      onBack={() => setScreen('preparation')} isCancelling={cancelled} onNavigate={() => setScreen('history')}
      onOpenSettings={() => {}} storageLabel="Fixture lokal" isKeyConfigured onNewQuizClick={() => setScreen('preparation')} />}
    <main className={processing ? 'processing-main flex-1' : 'flex-1'}>
      {screen === 'generation' && <GenerationLoader config={{ topic: 'Fotosintesis dan ekosistem', questionCount: 10, questionType: 'single_choice', difficulty: 'moderate', timeLimitMinutes: 15, language: 'id', enableGrounding: false }} completedCount={completed} isCancelling={cancelled} />}
      {screen === 'evaluation' && <EvaluationLoader result={result} evaluationState={{ targetIds: [], totalTargets: 10, completedCount: completed, isReEvaluation: false, savingConfirmed: true }} isCancelling={cancelled} />}
      {screen === 'preparation' && <QuizPreparation quiz={initial.quiz} onStart={() => setScreen('runner')} />}
      {screen === 'runner' && <QuizRunner quiz={{ ...initial.quiz, id: 'motion-preview-runner', timeLimitMinutes: 0 }} onQuit={() => setScreen('preparation')} onSubmit={() => setScreen('results')} />}
      {screen === 'results' && <QuizResults result={result} onRetake={() => setScreen('runner')} onNewQuiz={() => setScreen('preparation')} />}
      {screen === 'history' && <QuizHistoryView historyItems={history} onSelectQuiz={() => setScreen('results')} onClearHistory={() => setHistory([])} onDeleteItem={id => setHistory(items => items.filter(item => item.quiz.id !== id))} onNewQuiz={() => setScreen('preparation')} />}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<MotionRuntime><Preview /></MotionRuntime>);

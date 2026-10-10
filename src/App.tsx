import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings2, Monitor, Cloud, ArrowRight, RefreshCw } from 'lucide-react';
import type { Quiz, QuizConfig, QuizSubmission, QuizResult } from './types/quiz.js';
import { TopBar } from './components/TopBar.js';
import { QuizCreator } from './components/QuizCreator.js';
import { GenerationLoader } from './components/GenerationLoader.js';
import { QuizRunner } from './components/QuizRunner.js';
import { QuizResults } from './components/QuizResults.js';
import { QuizHistoryView } from './components/QuizHistoryView.js';
import { AISettings, type SettingsTab } from './components/AISettings.js';
import { useWorkspace } from './workspace/useWorkspace.js';
import { availableKeys, generateWorkspaceQuiz } from './workspace/ai.js';
import { accountRpc } from './workspace/supabase.js';
import type { GenerationJob, QuizProgress } from './workspace/types.js';

export default function App() {
  const w = useWorkspace();
  const [view, setView] = useState<'creator' | 'runner' | 'results' | 'history'>('creator');
  const [quiz, setQuiz] = useState<Quiz | null>(null); const [result, setResult] = useState<QuizResult | null>(null);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [generation, setGeneration] = useState<{ config: QuizConfig; completed: number }>({ config: { topic: '', questionCount: 1 } as QuizConfig, completed: 0 });
  const abort = useRef<AbortController | null>(null); const scope = useRef(w.scope); scope.current = w.scope;
  const restoredScope = useRef<string | null>(null);
  const attemptedProgress = useRef('');
  useEffect(() => {
    abort.current?.abort(); setLoading(false); setQuiz(null); setResult(null); setView('creator'); setError(''); attemptedProgress.current = ''; restoredScope.current = null;
  }, [w.scope, w.mode]);
  useEffect(() => {
    if (!w.ready || restoredScope.current === w.scope) return;
    restoredScope.current = w.scope;
    if (w.data.progress) {
      const saved = w.data.history.find(item => item.quiz.id === w.data.progress!.quizId);
      if (saved) { setQuiz(saved.quiz); setView('runner'); }
    }
  }, [w.ready, w.scope, w.data.progress, w.data.history]);
  useEffect(() => { if (w.passwordRecovery) setSettings('account'); }, [w.passwordRecovery]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [view]);
  const persistDraft = useCallback((draft: Record<string, unknown>) => { void w.update(d => ({ ...d, draft })).catch(() => {}); }, [w.update]);
  const persistProgress = useCallback((progress: QuizProgress) => {
    const serialized = JSON.stringify(progress); if (attemptedProgress.current === serialized) return;
    attemptedProgress.current = serialized;
    void w.update(d => ({ ...d, progress })).catch(() => { attemptedProgress.current = ''; });
  }, [w.update]);
  const newQuiz = () => { setQuiz(null); setResult(null); setError(''); setView('creator'); void w.update(d => ({ ...d, progress: null })).catch(() => {}); };
  const generate = async (config: QuizConfig, resume?: GenerationJob) => {
    if (loading || !w.ready || !w.repository) return;
    const origin = w.scope; const repository = w.repository;
    const preferences = structuredClone(resume?.preferences || w.data.preferences);
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError(''); setGeneration({ config, completed: resume?.questions.length || 0 });
    const started = Date.now(); let currentJob: GenerationJob | undefined;
    try {
      const generated = await generateWorkspaceQuiz(config, preferences, [...w.keys], repository, async job => {
        currentJob = job; await w.update(d => ({ ...d, job }), origin);
      }, controller.signal, resume, completed => { if (scope.current === origin) setGeneration({ config, completed }); });
      controller.signal.throwIfAborted(); if (scope.current !== origin) return;
      await w.update(d => ({ ...d, job: null, history: [{ quiz: generated, savedAt: new Date().toISOString() }, ...d.history.filter(h => h.quiz.id !== generated.id)],
        activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), label: 'Pembuatan kuis', model: generated.model!, status: 'success' as const, durationMs: Date.now() - started }, ...d.activity].slice(0, 2000) }), origin);
      setQuiz(generated); setResult(null); setView('runner');
    } catch (e) {
      if (scope.current !== origin) return;
      const cancelled = controller.signal.aborted;
      setError(cancelled ? 'Pembuatan kuis dibatalkan. Batch yang sudah selesai tetap dicatat.' : (e as Error).message);
      await w.update(d => ({ ...d, job: currentJob ? { ...currentJob, status: cancelled ? 'cancelled' : 'interrupted' } : d.job,
        activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), label: 'Pembuatan kuis', model: preferences.model, status: cancelled ? 'cancelled' as const : 'failed' as const, durationMs: Date.now() - started,
          detail: cancelled ? 'Dibatalkan pengguna' : (e as Error).message }, ...d.activity].slice(0, 2000) }), origin).catch(() => {});
    } finally { if (scope.current === origin) { setLoading(false); abort.current = null; void w.refresh(); } }
  };
  const finish = (submission: QuizSubmission) => {
    if (!quiz) return;
    const total = quiz.questions.length;
    const correct = quiz.questions.filter(q => submission.userAnswers[q.id] === q.correctAnswerIndex).length;
    const unanswered = quiz.questions.filter(q => submission.userAnswers[q.id] === undefined).length;
    const score = Math.round(correct / total * 100);
    const next: QuizResult = { quiz, submission, score, correctCount: correct, incorrectCount: total - correct - unanswered,
      unansweredCount: unanswered, accuracyPercentage: score,
      evaluationAnalysis: score >= 90 ? 'Pemahaman Anda sangat baik. Pertahankan dan lanjutkan ke materi berikutnya.' : score >= 70 ? 'Fondasi Anda sudah baik. Tinjau kembali pembahasan soal yang belum tepat.' : 'Pelajari pembahasan, lalu ulangi latihan untuk memperkuat pemahaman.' };
    setResult(next); setView('results');
    void w.update(d => ({ ...d, progress: null, history: d.history.map(h => h.quiz.id === quiz.id ? { ...h, lastResult: next, attempts: [...(h.attempts || (h.lastResult ? [h.lastResult] : [])), next], savedAt: new Date().toISOString() } : h) })).catch(() => {});
  };
  const selectQuiz = (selected: Quiz) => {
    setQuiz(selected); const saved = w.data.history.find(h => h.quiz.id === selected.id);
    if (saved?.lastResult) { setResult(saved.lastResult); setView('results'); } else { setResult(null); setView('runner'); }
  };
  const retryQuiz = () => { void w.update(d => ({ ...d, progress: null })).then(() => { attemptedProgress.current = ''; setResult(null); setView('runner'); }).catch(() => {}); };
  const storageLabel = w.mode === 'guest' ? 'Lokal · perangkat ini' : `Akun · ${w.session?.user.email || 'pulihkan sesi'}`;
  const hasKey = availableKeys(w.keys, w.data.preferences).length > 0;
  return <div className="app-frame min-h-screen text-slate-900 flex flex-col font-sans">
    <TopBar activeView={view} isBusy={loading} onNavigate={setView} onOpenSettings={() => setSettings('account')} isKeyConfigured={hasKey} storageLabel={storageLabel} onNewQuizClick={newQuiz} />
    <div className="workspace-strip"><span>{w.mode === 'guest' ? <Monitor size={14} /> : <Cloud size={14} />}{storageLabel}</span><span role="status">{w.saving ? 'Menyimpan…' : !w.ready ? 'Penyimpanan belum siap' : 'Data mengikuti ruang aktif'}</span></div>
    <main className="flex-1 w-full" aria-busy={loading || w.mode === 'initializing'}>
      {w.error && <div className="page-shell !pb-0 !pt-5"><div className="settings-alert error" role="alert"><span>{w.error}</span><button onClick={() => void w.refresh()}><RefreshCw size={15} />Muat ulang data</button></div></div>}
      {w.mode === 'initializing' ? <div className="workspace-loading" role="status">Memulihkan ruang penyimpanan…</div> : !w.ready ? <div className="workspace-loading"><h1>Penyimpanan perlu diperiksa</h1><p>Data lokal dan akun tetap terpisah. Periksa koneksi atau pulihkan sesi Anda.</p><button className="settings-primary" onClick={() => setSettings('account')}>Buka pengaturan akun</button></div> : loading ? <>
        <GenerationLoader topic={generation.config.topic} enableGrounding={w.data.preferences.grounding} model={w.data.preferences.model} />
        <div className="generation-controls"><span>{generation.completed}/{generation.config.questionCount} soal selesai</span><button className="settings-secondary" onClick={() => { abort.current?.abort(); if (w.mode === 'account' && w.data.job) void accountRpc(w.scope, 'qm_cancel_job', { p_id: w.data.job.id }).catch(() => {}); }}>Batalkan pembuatan</button></div>
      </> : view === 'creator' ? <>
        {w.data.job && ['running','interrupted'].includes(w.data.job.status) && <div className="page-shell !pb-0 !pt-5"><div className="resume-banner"><div><strong>Pembuatan kuis belum selesai</strong><p>{w.data.job.questions.length}/{w.data.job.config.questionCount} soal tersimpan. Melanjutkan memakai kuota AI.</p></div><button className="settings-secondary" onClick={() => void generate(w.data.job!.config, w.data.job!)}>Lanjutkan</button><button className="settings-link" onClick={() => void w.update(d => ({ ...d, job: null })).catch(() => {})}>Abaikan</button></div></div>}
        <QuizCreator key={w.scope} onGenerate={config => void generate(config)} isLoading={loading} errorMessage={error || null} preferences={w.data.preferences} hasApiKey={hasKey} storageLabel={storageLabel} onOpenSettings={() => setSettings('keys')} initialDraft={w.data.draft} onDraft={persistDraft} />
      </> : view === 'runner' && quiz ? <QuizRunner key={`${w.scope}:${quiz.id}`} quiz={quiz} onSubmit={finish} onQuit={newQuiz} initialProgress={w.data.progress} onProgress={persistProgress} />
      : view === 'results' && result ? <QuizResults result={result} onRetake={retryQuiz} onNewQuiz={newQuiz} />
      : view === 'history' ? <QuizHistoryView historyItems={w.data.history} onSelectQuiz={selectQuiz} onClearHistory={() => void w.update(d => ({ ...d, history: [], progress: null })).catch(() => {})} onDeleteItem={id => void w.update(d => ({ ...d, history: d.history.filter(h => h.quiz.id !== id), progress: d.progress?.quizId === id ? null : d.progress })).catch(() => {})} onNewQuiz={newQuiz} />
      : <div className="workspace-loading"><p>Mulai sesi belajar baru.</p><button onClick={newQuiz} className="settings-primary">Buat kuis <ArrowRight size={16} /></button></div>}
    </main>
    <footer className="app-footer print:hidden"><span><strong>Quiz Mind AI</strong> · Ruang untuk rasa ingin tahu.</span><button onClick={() => setSettings('account')}><Settings2 size={14} />Pengaturan AI</button></footer>
    {settings && <AISettings key={w.scope} workspace={w} initialTab={settings} onClose={() => setSettings(null)} onSelectQuiz={selectQuiz} accountLocked={loading || view === 'runner'} />}
  </div>;
}

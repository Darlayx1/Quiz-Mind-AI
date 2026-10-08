/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { fetchApi, setPersonalApiKey, standalonePages, keyRevision, subscribeKeys, hasSessionKeys, logoutCloud, isCloudActive, safeError, cloudApi } from './api.js';
import { Quiz, QuizConfig, QuizSubmission, QuizResult } from './types/quiz.js';
import { TopBar } from './components/TopBar.js';
import { QuizCreator } from './components/QuizCreator.js';
import { GenerationLoader } from './components/GenerationLoader.js';
import { QuizRunner } from './components/QuizRunner.js';
import { QuizResults } from './components/QuizResults.js';
import { QuizHistoryView } from './components/QuizHistoryView.js';
import { SecurityGuideModal } from './components/SecurityGuideModal.js';
import { AIConnectionsModal } from './components/AIConnectionsModal.js';
import { DEFAULT_MODEL, AIModel, type AIProvider } from './models.js';
import { VAULT_STORAGE_KEY } from './personalKeyVault.js';
import { MULTI_VAULT_KEY } from './multiKeyVault.js';

const STORAGE_KEY = 'quizmind_ai_history_v1';

export default function App() {
  const keysRevision = useSyncExternalStore(subscribeKeys, keyRevision);
  const requestController = useRef<AbortController | null>(null);
  const [keyMessage,setKeyMessage] = useState('');
  useEffect(() => {
    const notice = (event: Event) => setKeyMessage((event as CustomEvent<string>).detail);
    window.addEventListener('key-notice',notice);
    return () => { window.removeEventListener('key-notice',notice); requestController.current?.abort(); };
  }, []);
  const [activeView, setActiveView] = useState<'creator' | 'runner' | 'results' | 'history'>('creator');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [currentResult, setCurrentResult] = useState<QuizResult | null>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [activeView]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState('');
  const [loadingGrounding, setLoadingGrounding] = useState(true);
  const [loadingModel, setLoadingModel] = useState<AIModel>(DEFAULT_MODEL);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const personalMode = standalonePages || Boolean(apiKey.trim());
  const handleApiKeyChange = useCallback((value: string) => {
    setPersonalApiKey(value);
    setApiKey(value);
    setErrorMessage(null);
  }, []);
  useEffect(() => { if (apiKey === '__cloud__' && !isCloudActive()) setApiKey(''); }, [keysRevision, apiKey]);

  // Changes in another tab invalidate the active key on every application view.
  useEffect(() => {
    const syncVault = (event: StorageEvent) => {
      if (event.key === VAULT_STORAGE_KEY || event.key === MULTI_VAULT_KEY || event.key === null) handleApiKeyChange('');
    };
    window.addEventListener('storage', syncVault);
    return () => window.removeEventListener('storage', syncVault);
  }, [handleApiKeyChange]);

  // Expire plaintext using a deadline, including when background timers are delayed.
  useEffect(() => {
    if (!apiKey) return;
    let timer: ReturnType<typeof setTimeout>;
    let deadline = 0;
    let lastPing = 0;
    const lock = () => { requestController.current?.abort(); if (isCloudActive()) void logoutCloud().catch(() => {}); handleApiKeyChange(''); };
    const reset = () => {
      if (deadline && Date.now() >= deadline) { lock(); return; }
      clearTimeout(timer);
      deadline = Date.now() + 15 * 60 * 1000;
      timer = setTimeout(lock, 15 * 60 * 1000);
      if (isCloudActive() && Date.now() - lastPing > 60_000) {
        lastPing = Date.now();
        void cloudApi('session').catch(lock);
      }
    };
    const check = () => { if (Date.now() >= deadline) lock(); };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('focus', check);
    window.addEventListener('pagehide', lock);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('focus', check);
      window.removeEventListener('pagehide', lock);
      document.removeEventListener('visibilitychange', check);
    };
  }, [apiKey, handleApiKeyChange]);

  const [historyItems, setHistoryItems] = useState<
    Array<{ quiz: Quiz; lastResult?: QuizResult; savedAt: string }>
  >([]);

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [connectionsOpen,setConnectionsOpen] = useState(false);
  const [serverSecurity, setServerSecurity] = useState({
    hasApiKey: false,
    providers: [] as AIProvider[],
    maskedKey: 'Memuat...',
  });

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistoryItems(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Gagal membaca riwayat kuis dari localStorage:', err);
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (items: Array<{ quiz: Quiz; lastResult?: QuizResult; savedAt: string }>) => {
    setHistoryItems(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('Gagal menyimpan riwayat kuis ke localStorage:', err);
    }
  };

  // Fetch server health & security status
  useEffect(() => {
    fetchApi('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.security) {
          setServerSecurity({
            hasApiKey: Boolean(data.security.hasApiKey),
            providers: data.security.providers || [],
            maskedKey: data.security.maskedKey || 'Tidak terdeteksi',
          });
        }
      })
      .catch((err) => {
        console.warn('Gagal menghubungi /api/health:', err);
      });
  }, [apiKey, keysRevision]);

  // Handle Quiz Generation
  const handleGenerateQuiz = async (config: QuizConfig) => {
    if (requestController.current) return;
    const controller = new AbortController();
    requestController.current = controller;
    setKeyMessage('');
    setLoadingModel(config.model ?? DEFAULT_MODEL);
    setIsLoading(true);
    setLoadingTopic(config.topic);
    setLoadingGrounding(config.enableGrounding);
    setErrorMessage(null);

    try {
      const response = await fetchApi('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(
          response.status === 404
            ? 'Endpoint API tidak ditemukan (404). Server backend sedang sinkronisasi, silakan ulangi.'
            : `Respon server bukan format JSON valid (${response.status}): ${text.slice(0, 100)}`
        );
      }

      const data = await response.json();
      if (data.notices?.length) setKeyMessage(data.notices.join(' '));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses kuis dengan model Gemini yang dipilih.');
      }

      const generatedQuiz: Quiz = data.quiz;
      setCurrentQuiz(generatedQuiz);
      setCurrentResult(null);

      // Simpan ke riwayat kuis
      const updatedHistory = [
        {
          quiz: generatedQuiz,
          savedAt: new Date().toISOString(),
        },
        ...historyItems.filter((item) => item.quiz.id !== generatedQuiz.id),
      ];
      saveHistory(updatedHistory);

      // Pindah ke tampilan runner kuis
      setActiveView('runner');
    } catch (err: any) {
      setErrorMessage(err?.name === 'AbortError' ? 'Pembuatan kuis dibatalkan. Pengaturan Anda tetap tersedia.' : safeError(err));
    } finally {
      setIsLoading(false);
      requestController.current = null;
    }
  };

  // Handle Quiz Submission
  const handleSubmitQuiz = (submission: QuizSubmission) => {
    if (!currentQuiz) return;

    let correctCount = 0;
    let unansweredCount = 0;

    currentQuiz.questions.forEach((q) => {
      const userAns = submission.userAnswers[q.id];
      if (userAns === undefined) {
        unansweredCount++;
      } else if (userAns === q.correctAnswerIndex) {
        correctCount++;
      }
    });

    const total = currentQuiz.questions.length;
    const incorrectCount = total - correctCount - unansweredCount;
    const score = Math.round((correctCount / total) * 100);
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    let analysis = 'Pemahaman materi cukup baik.';
    if (score >= 90) {
      analysis = 'Luar biasa! Anda menguasai topik ini secara komprehensif dengan penalaran tingkat tinggi.';
    } else if (score >= 70) {
      analysis = 'Bagus! Anda memiliki fondasi pemahaman yang solid. Perhatikan pembahasan pada butir soal yang keliru.';
    } else if (score >= 50) {
      analysis = 'Cukup baik. Disarankan untuk meninjau kembali penalaran mendalam pada lembar pembahasan di bawah.';
    } else {
      analysis = 'Perlu pendalaman lebih lanjut. Pelajari penjelasan sumber fakta Google Grounding untuk memperkuat konsep.';
    }

    const result: QuizResult = {
      quiz: currentQuiz,
      submission,
      score,
      correctCount,
      incorrectCount,
      unansweredCount,
      accuracyPercentage: accuracy,
      evaluationAnalysis: analysis,
    };

    setCurrentResult(result);

    // Update result di riwayat kuis
    const updatedHistory = historyItems.map((item) => {
      if (item.quiz.id === currentQuiz.id) {
        return {
          ...item,
          lastResult: result,
          savedAt: new Date().toISOString(),
        };
      }
      return item;
    });
    saveHistory(updatedHistory);

    setActiveView('results');
  };

  // Retake current quiz
  const handleRetakeQuiz = () => {
    if (currentQuiz) {
      setCurrentResult(null);
      setActiveView('runner');
    }
  };

  // Start fresh quiz
  const handleNewQuiz = () => {
    setCurrentQuiz(null);
    setCurrentResult(null);
    setErrorMessage(null);
    setActiveView('creator');
  };

  // Select quiz from history
  const handleSelectHistoryQuiz = (quiz: Quiz) => {
    setCurrentQuiz(quiz);
    const existing = historyItems.find((item) => item.quiz.id === quiz.id);
    if (existing?.lastResult) {
      setCurrentResult(existing.lastResult);
      setActiveView('results');
    } else {
      setCurrentResult(null);
      setActiveView('runner');
    }
  };

  // Delete single history item
  const handleDeleteHistoryItem = (quizId: string) => {
    const updated = historyItems.filter((item) => item.quiz.id !== quizId);
    saveHistory(updated);
  };

  // Clear all history
  const handleClearAllHistory = () => {
    saveHistory([]);
  };

  return (
    <div className="app-frame min-h-screen text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* TopBar 3-zone standard navigation */}
      <TopBar
        activeView={activeView}
        isBusy={isLoading}
        onNavigate={(view) => setActiveView(view)}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
        onOpenConnections={() => setConnectionsOpen(true)}
        isKeyConfigured={hasSessionKeys() || (!apiKey && !standalonePages && serverSecurity.hasApiKey)}
        onNewQuizClick={handleNewQuiz}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full" aria-busy={isLoading}>
        {keyMessage && <p className="key-notice" role="status">{keyMessage}</p>}
        {isLoading && (
          <div><GenerationLoader
            topic={loadingTopic}
            enableGrounding={loadingGrounding}
            model={loadingModel}
          /><div className="generation-cancel"><button type="button" className="topic-chip" onClick={() => requestController.current?.abort()}>Batalkan pembuatan kuis</button><p className="field-help">Permintaan yang sudah diterima penyedia AI dapat tetap memakai kuota.</p></div></div>
        )}
        {activeView === 'creator' ? (
          <div hidden={isLoading}>
          <QuizCreator
            onGenerate={handleGenerateQuiz}
            isLoading={isLoading}
            errorMessage={errorMessage}
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
            requiresApiKey={standalonePages}
            onOpenConnections={() => setConnectionsOpen(true)}
            serverProviders={serverSecurity.providers}
          />
          </div>
        ) : activeView === 'runner' && currentQuiz ? (
          <QuizRunner
            quiz={currentQuiz}
            onSubmit={handleSubmitQuiz}
            onQuit={handleNewQuiz}
          />
        ) : activeView === 'results' && currentResult ? (
          <QuizResults
            result={currentResult}
            onRetake={handleRetakeQuiz}
            onNewQuiz={handleNewQuiz}
          />
        ) : activeView === 'history' ? (
          <QuizHistoryView
            historyItems={historyItems}
            onSelectQuiz={handleSelectHistoryQuiz}
            onClearHistory={handleClearAllHistory}
            onDeleteItem={handleDeleteHistoryItem}
            onNewQuiz={handleNewQuiz}
          />
        ) : (
          <div className="py-20 text-center">
            <p className="text-slate-500 text-sm">Tidak ada kuis yang sedang aktif.</p>
            <button
              onClick={handleNewQuiz}
              className="mt-3 text-blue-600 font-semibold text-sm hover:underline cursor-pointer"
            >
              Mulai Buat Kuis
            </button>
          </div>
        )}
      </main>

      {/* Subtle modern footer */}
      <footer className="w-full border-t border-slate-200/80 py-6 px-4 bg-white text-xs text-slate-500 text-center print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">QuizMind AI</span>
            <span>·</span>
            <span>Belajar dengan rasa ingin tahu.</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSecurityModalOpen(true)}
              className="hover:text-slate-800 transition-colors cursor-pointer"
            >
              Privasi API Key
            </button>
            <span>·</span>
            <span>{personalMode ? 'Vault pribadi · key aktif di memori' : 'Privasi terjaga'}</span>
          </div>
        </div>
      </footer>

      {/* Security Guide Modal */}
      <AIConnectionsModal open={connectionsOpen} onClose={() => setConnectionsOpen(false)} apiKey={apiKey} onApiKeyChange={handleApiKeyChange} serverProviders={serverSecurity.providers}/>
      <SecurityGuideModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        maskedKey={serverSecurity.maskedKey}
        personalMode={personalMode}
      />
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { fetchApi, setPersonalApiKey, standalonePages } from './api.js';
import { Quiz, QuizConfig, QuizSubmission, QuizResult } from './types/quiz.js';
import { TopBar } from './components/TopBar.js';
import { QuizCreator } from './components/QuizCreator.js';
import { GenerationLoader } from './components/GenerationLoader.js';
import { QuizRunner } from './components/QuizRunner.js';
import { QuizResults } from './components/QuizResults.js';
import { QuizHistoryView } from './components/QuizHistoryView.js';
import { SecurityGuideModal } from './components/SecurityGuideModal.js';
import { DEFAULT_MODEL, AIModel } from './models.js';

const STORAGE_KEY = 'quizmind_ai_history_v1';

export default function App() {
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
  const handleApiKeyChange = (value: string) => {
    setPersonalApiKey(value);
    setApiKey(value);
    setErrorMessage(null);
  };

  const [historyItems, setHistoryItems] = useState<
    Array<{ quiz: Quiz; lastResult?: QuizResult; savedAt: string }>
  >([]);

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [serverSecurity, setServerSecurity] = useState({
    hasApiKey: false,
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
            maskedKey: data.security.maskedKey || 'Tidak terdeteksi',
          });
        }
      })
      .catch((err) => {
        console.warn('Gagal menghubungi /api/health:', err);
      });
  }, [apiKey]);

  // Handle Quiz Generation
  const handleGenerateQuiz = async (config: QuizConfig) => {
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
      console.error('Generate quiz error:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat menghubungi server.');
    } finally {
      setIsLoading(false);
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
        isKeyConfigured={serverSecurity.hasApiKey}
        onNewQuizClick={handleNewQuiz}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full" aria-busy={isLoading}>
        {isLoading && (
          <GenerationLoader
            topic={loadingTopic}
            enableGrounding={loadingGrounding}
            model={loadingModel}
          />
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
            <span>{personalMode ? 'Kunci hanya untuk sesi ini' : 'Privasi terjaga'}</span>
          </div>
        </div>
      </footer>

      {/* Security Guide Modal */}
      <SecurityGuideModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        maskedKey={serverSecurity.maskedKey}
        personalMode={personalMode}
      />
    </div>
  );
}

// Local-only fixtures: no provider calls, credentials, or saved history.
import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuizRunner } from '../src/components/QuizRunner.js';
import { QUESTION_TYPES, type Quiz, type QuizSubmission, type StoredAnswer } from '../src/types/quiz.js';
import type { QuizProgress } from '../src/workspace/types.js';
import { validateQuestion } from '../src/questionValidation.js';
import { fixtures } from './assessment-fixtures.js';
import '../src/index.css';

const prompts = [
  'Manakah contoh penerapan konsep yang paling tepat?',
  'Pilih semua pernyataan yang mendukung kesimpulan berikut.',
  'Pernyataan berikut selalu benar untuk setiap kondisi. Benar atau salah?',
  'Berapakah hasil penjumlahan dua dan dua?',
  'Jelaskan konsep ini dengan alasan dan contoh yang mendukung jawaban Anda.',
  'Pasangkan setiap konsep dengan makna yang sesuai.',
  'Susun langkah-langkah berikut dalam urutan yang benar.',
];
const questions = QUESTION_TYPES.map((type, index) => validateQuestion({ ...fixtures[type], id: `fixture-${index + 1}`, question: prompts[index] }, index, 'Konsep', [], type)!);

function SessionPreview() {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [submission, setSubmission] = useState<QuizSubmission | null>(null);
  const [session, setSession] = useState(0);
  const start = (sequential: boolean, seconds: number, restored = false) => {
    setSession(value => value + 1);
    setSubmission(null);
    const next: Quiz = {
      id: 'test-session', title: 'Memahami konsep, melatih penalaran', topic: 'Konsep', summary: 'Fixture',
      difficulty: 'moderate', questions, createdAt: new Date().toISOString(),
      displayMode: sequential ? 'sequential' : 'non_sequential', timeLimitMinutes: seconds / 60,
      timePerQuestionSeconds: seconds,
    };
    const answers: Record<string, StoredAnswer> = {
      'fixture-1': { type: 'single_choice', selectedOptionId: 'o0' },
      'fixture-2': { type: 'multiple_select', selectedOptionIds: ['o0', 'o2'] },
      'fixture-3': { type: 'true_false', value: false },
      'fixture-4': { type: 'short_answer', text: 'Empat' },
      'fixture-5': { type: 'essay', text: 'Penjelasan awal' },
      'fixture-6': { type: 'matching', pairs: { l1: 'r1' } },
    };
    setProgress(restored ? { quizId: next.id, currentIndex: 0, answers, bookmarks: ['fixture-2'], startedAt: Date.now(), deadline: seconds ? Date.now() + seconds * 1000 : 0, attemptId: 'preview-restored' } : null);
    setQuiz(next);
  };
  return <div className="app-frame min-h-screen">
    {!quiz && !submission && <div className="page-shell">
      <h1 className="text-xl font-semibold mb-3">Uji sesi lokal · 7 tipe pertanyaan</h1>
      <p className="text-sm text-slate-500 mb-5">Fixture terisolasi, tanpa API atau perubahan riwayat.</p>
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Bebas · tanpa batas', sequential: false, seconds: 0 },
          { label: 'Bebas · total 3 detik', sequential: false, seconds: 3 },
          { label: 'Sekuensial · tanpa batas', sequential: true, seconds: 0 },
          { label: 'Sekuensial · 5 detik per soal', sequential: true, seconds: 5 },
          { label: 'Timer normal · 10 menit', sequential: false, seconds: 600 },
          { label: 'Timer peringatan · 2 menit', sequential: false, seconds: 120 },
          { label: 'Timer kritis · 45 detik', sequential: false, seconds: 45 },
          { label: 'Progres campuran · dipulihkan', sequential: false, seconds: 0, restored: true },
        ].map(item => <button key={item.label} className="text-sm border rounded-lg p-3 bg-white" onClick={() => start(item.sequential, item.seconds, item.restored)}>{item.label}</button>)}
      </div>
    </div>}
    {submission ? <div className="page-shell"><h1>Pengumpulan diterima</h1><pre id="submission" className="whitespace-pre-wrap mt-4">{JSON.stringify(submission, null, 2)}</pre><button className="border rounded-lg p-3 mt-4" onClick={() => { setQuiz(null); setSubmission(null); }}>Pilih skenario lain</button></div>
      : quiz ? <QuizRunner key={session} quiz={quiz} initialProgress={progress} onProgress={setProgress} onSubmit={setSubmission} onQuit={() => setQuiz(null)} /> : null}
  </div>;
}
const previewRoot = import.meta.hot?.data.previewRoot ?? createRoot(document.getElementById('root')!);
if (import.meta.hot) import.meta.hot.data.previewRoot = previewRoot;
previewRoot.render(<StrictMode><SessionPreview /></StrictMode>);

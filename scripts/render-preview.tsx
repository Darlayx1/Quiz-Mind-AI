import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GenerationLoader } from '../src/components/GenerationLoader.js';
import { EvaluationLoader } from '../src/components/EvaluationLoader.js';
import type { Quiz, QuizResult } from '../src/types/quiz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const cssFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.endsWith('.css'));
const cssContent = fs.readFileSync(path.join(distDir, 'assets', cssFile!), 'utf8');

const dummyQuiz: Quiz = {
  id: 'q-sample',
  title: 'Struktur Sel dan Genetika',
  topic: 'Struktur Sel dan Genetika',
  summary: 'Latihan konsep esensial biologi sel.',
  difficulty: 'moderate',
  timeLimitMinutes: 15,
  createdAt: new Date().toISOString(),
  questions: [
    { id: '1', type: 'single_choice', question: 'Organel penghasil ATP?', options: ['Mitokondria', 'Ribosom'], optionIds: ['o0', 'o1'], correctAnswerIndex: 0, explanation: '', groundingSources: [] },
    { id: '2', type: 'essay', question: 'Jelaskan transpor membran.', referenceAnswer: '', rubric: [], maxLength: 1000, explanation: '', groundingSources: [] },
    { id: '3', type: 'short_answer', question: 'Fungsi kloroplas?', acceptedAnswers: [], referenceAnswer: '', requiredConcepts: [], maxLength: 200, caseSensitive: false, allowPartial: false, explanation: '', groundingSources: [] },
    { id: '4', type: 'essay', question: 'Analisis sintesis protein.', referenceAnswer: '', rubric: [], maxLength: 1000, explanation: '', groundingSources: [] }
  ]
};

const dummyResult: QuizResult = {
  quiz: dummyQuiz,
  submission: {
    quizId: 'q-sample',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    timeTakenSeconds: 320,
    bookmarkedQuestions: [],
    userAnswers: {
      '1': { type: 'single_choice', selectedOptionId: 'o0' },
      '2': { type: 'essay', text: 'Transpor pasif dan aktif...' },
      '3': { type: 'short_answer', text: 'Tempat fotosintesis' },
      '4': { type: 'essay', text: 'Transkripsi dan translasi...' }
    }
  },
  evaluations: {},
  score: 25,
  finalScore: null,
  earnedPoints: 1,
  totalPoints: 4,
  correctCount: 1,
  partialCount: 0,
  incorrectCount: 0,
  unansweredCount: 0,
  pendingCount: 3,
  status: 'partial',
  accuracyPercentage: 25,
  evaluationAnalysis: 'Evaluasi 3 jawaban sedang berlangsung.',
  evaluationSettings: {
    enabled: true,
    followGenerator: true,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    shortAnswerMode: 'ai',
    allowKeyFallback: true,
    allowModelFallback: true,
    fallbackModel: 'gemini-2.5-flash',
    allowProviderFallback: false,
    fallbackProvider: 'gemini',
    fallbackProviderModel: 'gemini-2.5-flash',
    reviewFlagged: false
  }
};

function buildHtml(title: string, componentHtml: string, maxWidth?: number) {
  const containerStyle = maxWidth ? `max-width: ${maxWidth}px; margin: 0 auto; background: #ffffff; min-height: 100vh; box-shadow: 0 0 30px rgba(0,0,0,0.06);` : '';
  const bodyStyle = maxWidth ? `background-color: #eef2f6; margin: 0; padding: 0; font-family: Inter, Segoe UI, system-ui, sans-serif; display: flex; justify-content: center;` : `background-color: #f6f8fc; margin: 0; padding: 0; font-family: Inter, Segoe UI, system-ui, sans-serif;`;

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${cssContent}
    body {
      ${bodyStyle}
      -webkit-font-smoothing: antialiased;
    }
    .preview-frame {
      ${containerStyle}
      width: 100%;
    }
  </style>
</head>
<body class="app-frame min-h-screen">
  <div class="preview-frame">
    <main class="w-full">
      ${componentHtml}
    </main>
  </div>
</body>
</html>`;
}

const outDir = path.resolve(__dirname, '../.qa/screenshots');
fs.mkdirSync(outDir, { recursive: true });

// 1. Generation - Waiting (Desktop)
const genWaiting = renderToString(
  <GenerationLoader
    config={{
      topic: 'Struktur Sel dan Genetika',
      questionCount: 5,
      difficulty: 'moderate',
      questionType: 'essay',
      timeLimitMinutes: 15,
      language: 'id',
      enableGrounding: true
    }}
    enableGrounding={true}
    model="gemini-2.5-flash"
    completedCount={0}
    onCancel={() => {}}
  />
);
fs.writeFileSync(path.join(outDir, 'generation-waiting.html'), buildHtml('Loading Generate — Menunggu AI', genWaiting));

// 2. Generation - In Progress (Mobile 390px)
const genProgress = renderToString(
  <GenerationLoader
    config={{
      topic: 'Struktur Sel dan Genetika',
      questionCount: 5,
      difficulty: 'moderate',
      questionType: 'single_choice',
      timeLimitMinutes: 15,
      language: 'id',
      enableGrounding: false
    }}
    enableGrounding={false}
    model="gemini-2.5-flash"
    completedCount={3}
    onCancel={() => {}}
  />
);
fs.writeFileSync(path.join(outDir, 'generation-progress-390.html'), buildHtml('Loading Generate — 3 dari 5 Soal', genProgress, 390));

// 3. Evaluation - Multi-target In Progress (Desktop)
const evalProgress = renderToString(
  <EvaluationLoader
    result={dummyResult}
    evaluationState={{
      targetIds: ['2', '3', '4'],
      totalTargets: 3,
      completedCount: 2,
      isReEvaluation: false,
      savingConfirmed: true
    }}
    onCancel={() => {}}
  />
);
fs.writeFileSync(path.join(outDir, 'evaluation-progress.html'), buildHtml('Loading Evaluasi — 2 dari 3 Jawaban', evalProgress));

// 4. Evaluation - Re-evaluation of Question 3 (Mobile 360px)
const evalReEval = renderToString(
  <EvaluationLoader
    result={dummyResult}
    evaluationState={{
      targetIds: ['3'],
      totalTargets: 1,
      completedCount: 0,
      isReEvaluation: true,
      questionNumber: 3,
      savingConfirmed: true
    }}
    onCancel={() => {}}
  />
);
fs.writeFileSync(path.join(outDir, 'evaluation-reeval-360.html'), buildHtml('Loading Evaluasi — Penilaian Ulang Soal 3', evalReEval, 360));

console.log('Mobile-framed preview HTML files generated successfully in', outDir);

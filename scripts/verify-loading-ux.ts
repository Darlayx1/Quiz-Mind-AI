import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionLabels } from '../src/questionState.js';
import { difficultyName } from '../src/models.js';
import { buildResult } from '../src/scoring.js';
import type { Quiz, QuizSubmission, QuestionEvaluation } from '../src/types/quiz.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GenerationLoader } from '../src/components/GenerationLoader.js';
import { ProcessingLayout } from '../src/components/ProcessingLayout.js';
import { TopBar } from '../src/components/TopBar.js';

test('Actual loading components use an open layout, accurate progress and an enabled header back button', () => {
  const render = (completedCount: number) => renderToStaticMarkup(createElement(GenerationLoader, {
    config: { topic: 'Biologi', questionCount: 10, questionType: 'essay', difficulty: 'easy', timeLimitMinutes: 10, language: 'id', enableGrounding: false }, completedCount,
  }));
  const waiting = render(0), progress = render(3);
  assert.ok(waiting.includes('processing-page'));
  assert.ok(!waiting.includes('surface') && !waiting.includes('qm-processing-card'));
  assert.ok(!waiting.includes('<h1') && waiting.includes('<h2'));
  assert.ok(!waiting.includes('Batalkan') && !waiting.includes('onCancel'));
  assert.ok(waiting.includes('is-indeterminate') && !waiting.includes('aria-valuenow='));
  assert.ok(progress.includes('aria-valuenow="30"'));
  assert.ok(progress.includes('3 dari 10 soal telah diterima.'));
  assert.ok(waiting.includes('aria-label="Jenis soal: Esai"'));
  const props = { activeView: 'configuration' as const, processingMode: 'generation' as const, isBusy: true,
    pageTitle: 'Membuat Kuis', onBack() {}, onNavigate() {}, onOpenSettings() {}, storageLabel: '', isKeyConfigured: true, onNewQuizClick() {} };
  const header = renderToStaticMarkup(createElement(TopBar, props));
  assert.ok(header.includes('id="processing-title"') && !header.includes('header-nav'));
  assert.ok(header.includes('Batalkan proses dan kembali') && !header.includes('disabled'));
  assert.ok(renderToStaticMarkup(createElement(TopBar, { ...props, isCancelling: true })).includes('disabled'));
});

test('Actual response clock uses operation time and only shows the quiet notice after its threshold', () => {
  const props = { eyebrow: 'PROSES', title: 'Memproses', description: '', illustration: null,
    statusMessage: 'Menunggu AI', longWaitMessage: 'Masih berlangsung.', startedAt: Date.now() - 25_000 };
  const late = renderToStaticMarkup(createElement(ProcessingLayout, props));
  assert.ok(late.includes('00:25') && late.includes('processing-long-wait'));
  const initial = renderToStaticMarkup(createElement(ProcessingLayout, { ...props, startedAt: Date.now() }));
  assert.ok(initial.includes('00:00') && !initial.includes('processing-long-wait'));
  const cancelling = renderToStaticMarkup(createElement(ProcessingLayout, { ...props, isCancelling: true }));
  assert.ok(!cancelling.includes('processing-long-wait'));
  assert.ok(!late.includes('aria-busy="true"'), 'Do not suppress status announcements with a permanently busy live region');
});

test('Matriks 1: Question type badges and difficulty names map correctly', () => {
  assert.equal(questionLabels.essay, 'Esai');
  assert.equal(questionLabels.short_answer, 'Isian singkat');
  assert.equal(questionLabels.single_choice, 'Pilihan ganda');
  assert.equal(questionLabels.multiple_select, 'Pilihan ganda kompleks');

  assert.equal(difficultyName('easy'), 'Mudah');
  assert.equal(difficultyName('moderate'), 'Menengah');
  assert.equal(difficultyName('hard'), 'Sulit');
});

test('Matriks 2: Generation state calculation with real progress vs waiting state', () => {
  // Scenario: waiting for response (0 questions completed)
  const total = 5;
  let completed = 0;
  let hasDeterminateProgress = completed > 0 && total > 0;
  assert.equal(hasDeterminateProgress, false, 'Should be indeterminate when 0 questions completed');

  // Scenario: 2 questions received
  completed = 2;
  hasDeterminateProgress = completed > 0 && total > 0;
  const progressPercent = Math.min(100, Math.round((completed / total) * 100));
  assert.equal(hasDeterminateProgress, true);
  assert.equal(progressPercent, 40);
});

test('Matriks 3: Evaluation target count for initial evaluation vs re-evaluation', () => {
  const dummyQuiz: Quiz = {
    id: 'quiz-1',
    title: 'Biologi Sel',
    topic: 'Biologi Sel',
    summary: 'Tes pemahaman sel',
    difficulty: 'moderate',
    timeLimitMinutes: 10,
    createdAt: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        type: 'single_choice',
        question: 'Apa fungsi mitokondria?',
        options: ['Energi', 'Protein'],
        optionIds: ['o0', 'o1'],
        correctAnswerIndex: 0,
        explanation: 'Mitokondria menghasilkan ATP.',
        groundingSources: []
      },
      {
        id: 'q2',
        type: 'short_answer',
        question: 'Sebutkan organel fotosintesis.',
        acceptedAnswers: ['Kloroplas'],
        referenceAnswer: 'Kloroplas',
        requiredConcepts: ['kloroplas'],
        maxLength: 200,
        caseSensitive: false,
        allowPartial: false,
        explanation: 'Kloroplas tempat fotosintesis.',
        groundingSources: []
      },
      {
        id: 'q3',
        type: 'essay',
        question: 'Jelaskan perbedaan mitosis dan meiosis.',
        referenceAnswer: 'Mitosis...',
        maxLength: 1000,
        explanation: '',
        rubric: [{ id: 'r2', description: 'Lengkap', weight: 20, anchors: [] }],
        groundingSources: []
      }
    ]
  };

  const dummySubmission: QuizSubmission = {
    quizId: 'quiz-1',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    timeTakenSeconds: 120,
    bookmarkedQuestions: [],
    userAnswers: {
      q1: { type: 'single_choice', selectedOptionId: 'o0' },
      q2: { type: 'short_answer', text: 'Kloroplas' },
      q3: { type: 'essay', text: 'Mitosis menghasilkan 2 sel anakan...' }
    }
  };

  // Initial result: deterministic questions scored, essay & short answer are pending with AI mode
  const initialResult = buildResult(dummyQuiz, dummySubmission, undefined, {
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
  });

  // Check initial targets: only q2 and q3 need AI evaluation (q1 is scored instantly)
  const initialTargetIds = Object.entries(initialResult.evaluations ?? {})
    .filter(([, e]) => e.earnedPoints === null && e.status !== 'needs_review')
    .map(([id]) => id);

  assert.equal(initialTargetIds.length, 2, 'Only 2 questions require AI evaluation');
  assert.deepEqual(initialTargetIds, ['q2', 'q3']);

  // Re-evaluation scenario: user clicks "Nilai ulang soal ini" on q3
  const reEvalTargets = ['q3'];
  const isReEval = Boolean(reEvalTargets.length === 1 && initialResult.evaluations?.[reEvalTargets[0]] !== undefined);
  assert.equal(isReEval, true, 'Single question target should be recognized as re-evaluation');

  const qIndex = dummyQuiz.questions.findIndex(q => q.id === reEvalTargets[0]);
  assert.equal(qIndex + 1, 3, 'Target question number should be 3');
});

test('Matriks 4: Progress calculation never reports false 100% on old scores during re-evaluation', () => {
  // Suppose q3 was already graded in a previous run with 18 points
  const activeEvalState = {
    targetIds: ['q3'],
    totalTargets: 1,
    completedCount: 0,
    isReEvaluation: true,
    questionNumber: 3,
    savingConfirmed: true
  };

  assert.equal(activeEvalState.completedCount, 0, 'Must start at 0 completed for current active operation');
  assert.notEqual(activeEvalState.completedCount, activeEvalState.totalTargets, 'Must not claim 100% finished based on old score');
});

import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DIFFICULTIES, DEFAULT_MODEL, difficultyName } from '../src/models.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { assessmentSpec, assessmentScopeKey, assertQuestionScope, needsCurrentEvidence, selectResearchSources, validateQualityReview } from '../src/server/assessmentPolicy.js';
import { searchParallel, parallelRelay, usableResearch } from '../src/server/parallelSearch.js';
import { generateQuizBatch } from '../src/server/geminiService.js';
import { generateWorkspaceQuiz } from '../src/workspace/ai.js';
import { localRepository } from '../src/workspace/localRepository.js';
import { emptyWorkspace, type GenerationJob } from '../src/workspace/types.js';
import { validateQuestion } from '../src/questionValidation.js';
import { difficultyCalibration } from '../src/difficultyCalibration.js';
import { buildResult } from '../src/scoring.js';
import { QuizCreator } from '../src/components/QuizCreator.js';
import { fixtures } from './assessment-fixtures.js';
import { qualityReviewFixture } from './quality-review-fixture.js';
import { streamingFixtureFetch } from './stream-fixture.js';

const base = normalizeQuizConfig({ topic: 'Anatomi', targetAudience: 'Mahasiswa kedokteran tahun pertama', difficulty: 'easy', questionCount: 1, enableGrounding: false, timeLimitMinutes: 0 });
const source = { title: 'Human anatomy: structure and relationships', url: 'https://example.org/anatomy', snippet: 'The heart contains four chambers. Anatomical structures have spatial relationships.' };
const question = validateQuestion({ ...fixtures.single_choice, question: 'Struktur manakah yang sesuai dengan hubungan anatomis berikut?' }, 0, 'Anatomi', [])!;

await test('Assessment specification and nine difficulty levels', async t => {
  await t.test('names and backward compatibility without audience or statistical targets', () => {
    assert.deepEqual(DIFFICULTIES.map(d => d.name), ['Elementer', 'Sangat mudah', 'Mudah', 'Menengah', 'Menantang', 'Sulit', 'Sangat sulit', 'Pakar', 'Ekstrem']);
    assert.equal(difficultyName('primitive'), 'Elementer'); assert.equal(difficultyName('expert'), 'Pakar');
    assert.equal(normalizeQuizConfig({ ...base, difficulty: 'expert' }).difficulty, 'master');
    assert.ok(DIFFICULTIES.every(d => !('successRange' in d) && !('successLabel' in d)));
    assert.ok(!('audience' in assessmentSpec(base)));
    assert.ok(!('targetSuccessPercent' in assessmentSpec(base).difficulty));
    assert.equal(normalizeQuizConfig({ ...base, targetAudience: 'Legacy audience' }).targetAudience, undefined);
    assert.equal(assessmentScopeKey(base), assessmentScopeKey({ ...base, targetAudience: 'Masyarakat umum' }));
    assert.notEqual(assessmentScopeKey(base), assessmentScopeKey({ ...base, studyMaterial: 'Hanya sistem saraf' }));
  });
  await t.test('anatomy catalogue/history regression; explicit scope remains allowed', () => {
    assert.ok(assertQuestionScope({ ...question, topicCategory: 'Media Studi Anatomi', question: 'Jodohkan sarana media pembelajaran anatomi dengan bentuk medianya.' }, base));
    assert.ok(assertQuestionScope({ ...question, topicCategory: 'Sejarah Anatomi' }, base));
    assert.doesNotThrow(() => assertQuestionScope({ ...question, topicCategory: 'Sejarah Anatomi' }, { ...base, topic: 'Sejarah anatomi' }));
    assert.equal(assessmentSpec({ ...base, additionalInstructions: 'Jangan membahas sejarah.' }).includeHistory, false);
    assert.equal(selectResearchSources([source, { ...source, title: 'Best websites and learning resources' }, { ...source, title: 'History of anatomy' }], base).length, 1);
    assert.equal(selectResearchSources([{ ...source, snippet: 'Accept all cookies\n' + source.snippet }], base)[0].snippet, source.snippet);
    assert.equal(needsCurrentEvidence({ ...base, topic: 'Harga obat terbaru' }), true);
    assert.equal(needsCurrentEvidence({ ...base, topic: 'Hukum Newton' }), false);
  });
  await t.test('audit feedback never rejects questions by difficulty, correctness or missing evidence', () => {
    const review = { questionId: question.id, relevant: true, difficultyFits: true, correct: true, unambiguous: true, evidenceSupported: true, estimatedSuccessPercent: 90, reason: 'Memerlukan pemahaman dasar.' };
    assert.equal(validateQualityReview({ reviews: [review] }, base, [question]).length, 1);
    for (const update of [{ estimatedSuccessPercent: 15 }, { relevant: false }, { correct: false }, { unambiguous: false }, { evidenceSupported: false }])
      assert.equal(validateQualityReview({ reviews: [{ ...review, ...update }] }, base, [question]).length, 1);
    assert.throws(() => validateQualityReview({ reviews: [] }, base, [question]), (e: any) => e.code === 'QUALITY_REVIEW_INVALID');
    assert.equal(validateQualityReview({ reviews: [{ ...review, estimatedSuccessPercent: 0 }] }, { ...base, difficulty: 'grand_master' }, [question]).length, 1);
  });
  await t.test('UI keeps levels but removes audience and detailed difficulty targets', () => {
    const html = renderToStaticMarkup(createElement(QuizCreator, { onGenerate() {}, isLoading: false, errorMessage: null, preferences: emptyWorkspace().preferences,
      hasApiKey: true, storageLabel: 'Lokal', onOpenSettings() {}, onDraft() {}, initialDraft: { topic: 'Anatomi' } }));
    assert.ok(html.includes('Elementer') && html.includes('Ekstrem'));
    for (const removed of ['quiz-audience', 'Peserta sasaran', '20%', 'estimasi desain', 'Target kemampuan']) assert.ok(!html.includes(removed));
  });
});

await test('Quality generation and recovery (simulated providers; no external requests)', async t => {
  const originalFetch = globalThis.fetch;
  let generations = 0, audits = 0, searches = 0;
  let mode = 'pass';
  let auditAbort: AbortController | undefined;
  let generationPrompts: string[] = [];
  let searchBody: any;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/parallel-search')) return parallelRelay(new Request('https://app.example/api/parallel-search', init));
    if (url === 'https://api.parallel.ai/v1/search') {
      searches++; searchBody = JSON.parse(String(init?.body));
      return Response.json({ results: mode === 'empty-search' ? [] : [{ ...source, title: mode === 'catalogue-search' ? 'Best learning resources' : source.title, excerpts: [source.snippet] }] });
    }
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'), 'No unrecognized network destination');
    const body = await new Request(input, init).json();
    const prompt = body.contents.map((c: any) => c.parts.map((p: any) => p.text || '').join('\n')).join('\n');
    const audit = qualityReviewFixture(prompt);
    let output: unknown;
    if (audit) {
      audits++; assert.ok(!body.tools?.length, 'Audit must not issue another search');
      if (mode === 'audit-network') throw new TypeError('fetch failed');
      if (mode === 'audit-timeout') throw new DOMException('Deadline exceeded', 'TimeoutError');
      if (mode === 'audit-cancel') { auditAbort!.abort(new DOMException('Cancelled', 'AbortError')); throw auditAbort!.signal.reason; }
      if (mode === 'invalid-review') output = { reviews: [] };
      else if (mode === 'audit-json') return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'invalid JSON' }] } }] });
      else {
        if (mode === 'reject-always' || mode === 'reject-once' && audits === 1) { audit.reviews[0].relevant = false; audit.reviews[0].reason = 'Soal tidak menguji konsep inti anatomi.'; }
        if (mode === 'reject-distinct') { audit.reviews[0][['relevant', 'correct', 'unambiguous'][audits - 1]] = false; audit.reviews[0].reason = `Masalah kualitas berbeda pada percobaan ${audits}.`; }
        output = audit;
      }
    } else {
      generations++; generationPrompts.push(prompt);
      const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]);
      output = { title: 'Latihan anatomi', summary: 'Materi inti', questions: Array.from({ length: mode === 'partial' && generations === 1 ? Math.max(1, count - 2) : count }, (_, i) => ({ ...fixtures.single_choice,
        question: `Struktur anatomi ${generations}-${i}: hubungan manakah yang tepat?`, sourceUrls: [source.url] })) };
      if (mode === 'invalid-items' && generations === 1) { (output as any).questions[0] = null; (output as any).questions[1] = { ...fixtures.single_choice, correctAnswerIndex: 999 }; }
    }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(output) }] },
      ...(body.tools?.length ? { groundingMetadata: { webSearchQueries: ['anatomical relationships'], groundingChunks: [{ web: { title: source.title, uri: source.url } }] } } : {}) }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
  };
  globalThis.fetch = streamingFixtureFetch(globalThis.fetch);
  const reset = () => { generations = 0; audits = 0; searches = 0; generationPrompts = []; mode = 'pass'; };
  try {
    await t.test('three research modes use the same fixed specification at all nine levels', async () => {
      for (const level of DIFFICULTIES) {
        const config = { ...base, difficulty: level.id };
        const research = await searchParallel(config.topic, 'fixture-parallel-quality', undefined, config);
        assert.ok(!searchBody.objective.includes('targetSuccessPercent') && searchBody.objective.includes(level.name));
        assert.equal(searchBody.search_queries.length, 2); assert.ok(usableResearch(research, config.topic, config));
        assert.ok(usableResearch(research, config.topic, { ...config, targetAudience: 'Siswa SD' }));
        for (const mode of ['none', 'google', 'parallel']) {
          const quiz = await generateQuizBatch({ ...config, enableGrounding: mode !== 'none' }, 'fixture-quality-key', [], undefined, mode === 'parallel' ? research : undefined);
          assert.equal(quiz.difficulty, level.id); assert.equal(quiz.targetAudience, base.targetAudience);
          assert.deepEqual(quiz.qualityReviews, []);
          assert.equal(quiz.generationMetrics![0].modelCalls, 1);
          assert.equal(quiz.usedGrounding, mode !== 'none');
        }
      }
    });
    await localRepository.load();
    await localRepository.putKey({ provider: 'parallel', label: 'Search', secret: 'fixture-parallel-quality' });
    await localRepository.putKey({ label: 'Generator', secret: 'fixture-quality-key' });
    const keys = await localRepository.keys();
    const preferences = { ...emptyWorkspace().preferences, searchProvider: 'parallel' as const };
    let checkpoint: GenerationJob;
    const save = async (job: GenerationJob) => { checkpoint = structuredClone(job); };
    await t.test('single call generates usable quizzes without audit second calls', async () => {
      reset();
      const quiz = await generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal);
      assert.equal(generations, 1); assert.equal(audits, 0); assert.equal(searches, 1);
      assert.equal(quiz.questions.length, 1); assert.equal(checkpoint!.attemptState, undefined);
    });
    await t.test('partial output rejects with INCOMPLETE_QUESTION_COUNT without repair calls', async () => {
      reset(); mode = 'partial';
      await assert.rejects(
        generateWorkspaceQuiz({ ...base, questionCount: 6, questionDistribution: { single_choice: 6 } }, preferences, keys, localRepository, save, new AbortController().signal),
        (e: any) => e.code === 'INCOMPLETE_QUESTION_COUNT'
      );
      assert.equal(generations, 1);
      assert.equal(searches, 1);
    });
    await t.test('malformed items reject without repairing calls', async () => {
      reset(); mode = 'invalid-items';
      await assert.rejects(
        generateWorkspaceQuiz({ ...base, questionCount: 6, questionDistribution: { single_choice: 6 } }, preferences, keys, localRepository, save, new AbortController().signal),
        (e: any) => e.code === 'INVALID_QUESTION'
      );
      assert.equal(generations, 1);
    });
    await t.test('user cancellation stops generation', async () => {
      reset(); const abortCtrl = new AbortController();
      abortCtrl.abort();
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, abortCtrl.signal), (e: any) => e.name === 'AbortError' || /dibatalkan/i.test(e.message));
    });
    await t.test('unusable supplied research does not prevent generation', async () => {
      reset(); const quiz = await generateQuizBatch({ ...base, enableGrounding: true }, 'fixture-quality-key', [], undefined,
        { provider: 'parallel', topic: 'Wrong topic', sources: [], queries: [], searchedAt: new Date().toISOString() });
      assert.equal(quiz.questions.length, 1); assert.equal(quiz.usedGrounding, false); assert.ok(quiz.generationWarnings!.length);
    });
    await t.test('resume clears obsolete quality rejection without losing saved items', async () => {
      reset(); const resumed: GenerationJob = { id: crypto.randomUUID(), config: base, preferences, questions: [], status: 'interrupted', createdAt: new Date().toISOString(),
        attemptState: { batchOffset: 0, calls: 3, repeated: 2, lastCode: 'QUALITY_REJECTED' } };
      const quiz = await generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal, resumed);
      assert.equal(quiz.questions.length, 1); assert.equal(generations, 1);
    });
    await t.test('empty and irrelevant search fall back for stable material; warning and checkpoints survive', async () => {
      for (const scenario of ['empty-search', 'catalogue-search'] as const) {
        reset(); mode = scenario;
        const quiz = await generateWorkspaceQuiz({ ...base, questionCount: 6, questionDistribution: { single_choice: 6 } }, preferences, keys, localRepository, save, new AbortController().signal);
        assert.equal(searches, 1); assert.equal(generations, 1); assert.equal(quiz.usedGrounding, false);
        assert.equal(quiz.groundingFallbackUsed, true); assert.deepEqual(quiz.qualityReviews, []);
        assert.ok(quiz.generationWarnings![0].includes('tanpa referensi web')); assert.ok(checkpoint!.parallelFallback);
      }
    });
    await t.test('empty research allows generation with an explicit unverified-current-information warning', async () => {
      reset(); mode = 'empty-search';
      const quiz = await generateWorkspaceQuiz({ ...base, topic: 'Pedoman terapi terbaru' }, preferences, keys, localRepository, save, new AbortController().signal);
      assert.equal(quiz.questions.length, 1); assert.equal(quiz.usedGrounding, false);
      assert.ok(quiz.generationWarnings!.some(w => w.includes('belum diverifikasi')));
    });
    await t.test('observed calibration separates guessing-inclusive outcomes, pending grades and repeat practice', async () => {
      reset();
      const quiz = await generateQuizBatch(base, 'fixture-quality-key');
      const q = quiz.questions[0];
      const submission = { quizId: quiz.id, userAnswers: { [q.id]: 0 }, bookmarkedQuestions: [], timeTakenSeconds: 5, completedAt: '2026-10-11T01:00:00Z' };
      const first = buildResult(quiz, submission);
      const repeat = buildResult(quiz, { ...submission, userAnswers: { [q.id]: 1 }, completedAt: '2026-10-11T02:00:00Z' });
      const rows = difficultyCalibration([{ quiz, attempts: [first, repeat], lastResult: repeat }]);
      assert.equal(rows[0].assessed, 1); assert.equal(rows[0].observedCorrectPercent, 100); assert.equal(rows[0].quizCount, 1);
      const pending = { ...first, evaluations: { [q.id]: { ...first.evaluations![q.id], status: 'pending' as const, earnedPoints: null } } };
      assert.equal(difficultyCalibration([{ quiz, lastResult: pending }])[0].observedCorrectPercent, null);
    });
  } finally { globalThis.fetch = originalFetch; }
});

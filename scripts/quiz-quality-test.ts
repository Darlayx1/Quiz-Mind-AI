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

const base = normalizeQuizConfig({ topic: 'Anatomi', targetAudience: 'Mahasiswa kedokteran tahun pertama', difficulty: 'easy', questionCount: 1, enableGrounding: false, timeLimitMinutes: 0 });
const source = { title: 'Human anatomy: structure and relationships', url: 'https://example.org/anatomy', snippet: 'The heart contains four chambers. Anatomical structures have spatial relationships.' };
const question = validateQuestion({ ...fixtures.single_choice, question: 'Struktur manakah yang sesuai dengan hubungan anatomis berikut?' }, 0, 'Anatomi', [])!;

await test('Assessment specification and nine difficulty levels', async t => {
  await t.test('names, backward compatibility, contiguous descending mastery ranges and audience', () => {
    assert.deepEqual(DIFFICULTIES.map(d => d.name), ['Elementer', 'Sangat mudah', 'Mudah', 'Menengah', 'Menantang', 'Sulit', 'Sangat sulit', 'Pakar', 'Ekstrem']);
    assert.equal(difficultyName('primitive'), 'Elementer'); assert.equal(difficultyName('expert'), 'Pakar');
    assert.equal(normalizeQuizConfig({ ...base, difficulty: 'expert' }).difficulty, 'master');
    for (let i = 1; i < 9; i++) assert.equal(DIFFICULTIES[i].successRange[1], DIFFICULTIES[i - 1].successRange[0]);
    assert.equal(assessmentSpec(base).audience, base.targetAudience);
    assert.notEqual(assessmentScopeKey(base), assessmentScopeKey({ ...base, targetAudience: 'Masyarakat umum' }));
    assert.notEqual(assessmentScopeKey(base), assessmentScopeKey({ ...base, studyMaterial: 'Hanya sistem saraf' }));
  });
  await t.test('anatomy catalogue/history regression; explicit scope remains allowed', () => {
    assert.throws(() => assertQuestionScope({ ...question, topicCategory: 'Media Studi Anatomi', question: 'Jodohkan sarana media pembelajaran anatomi dengan bentuk medianya.' }, base), /cakupan/);
    assert.throws(() => assertQuestionScope({ ...question, topicCategory: 'Sejarah Anatomi' }, base), /cakupan/);
    assert.doesNotThrow(() => assertQuestionScope({ ...question, topicCategory: 'Sejarah Anatomi' }, { ...base, topic: 'Sejarah anatomi' }));
    assert.equal(assessmentSpec({ ...base, additionalInstructions: 'Jangan membahas sejarah.' }).includeHistory, false);
    assert.equal(selectResearchSources([source, { ...source, title: 'Best websites and learning resources' }, { ...source, title: 'History of anatomy' }], base).length, 1);
    assert.equal(selectResearchSources([{ ...source, snippet: 'Accept all cookies\n' + source.snippet }], base)[0].snippet, source.snippet);
    assert.equal(needsCurrentEvidence({ ...base, topic: 'Harga obat terbaru' }), true);
    assert.equal(needsCurrentEvidence({ ...base, topic: 'Hukum Newton' }), false);
  });
  await t.test('audit rejects wrong difficulty, zero-probability extremes, invalid keys, ambiguity and unsupported citations', () => {
    const review = { questionId: question.id, relevant: true, difficultyFits: true, correct: true, unambiguous: true, evidenceSupported: true, estimatedSuccessPercent: 90, reason: 'Memerlukan pemahaman dasar.' };
    assert.equal(validateQualityReview({ reviews: [review] }, base, [question]).length, 1);
    for (const update of [{ estimatedSuccessPercent: 15 }, { relevant: false }, { correct: false }, { unambiguous: false }, { evidenceSupported: false }])
      assert.throws(() => validateQualityReview({ reviews: [{ ...review, ...update }] }, base, [question]), (e: any) => e.code === 'QUALITY_REJECTED');
    assert.throws(() => validateQualityReview({ reviews: [] }, base, [question]), (e: any) => e.code === 'QUALITY_REVIEW_INVALID');
    assert.throws(() => validateQualityReview({ reviews: [{ ...review, estimatedSuccessPercent: 0 }] }, { ...base, difficulty: 'grand_master' }, [question]), /belum memenuhi/);
  });
  await t.test('UI exposes renamed matrix, audience and guessing limits', () => {
    const html = renderToStaticMarkup(createElement(QuizCreator, { onGenerate() {}, isLoading: false, errorMessage: null, preferences: emptyWorkspace().preferences,
      hasApiKey: true, storageLabel: 'Lokal', onOpenSettings() {}, onDraft() {}, initialDraft: { topic: 'Anatomi' } }));
    assert.ok(html.includes('Elementer') && html.includes('Ekstrem') && html.includes('quiz-audience') && html.includes('20%') && html.includes('estimasi desain'));
  });
});

await test('Quality generation and recovery (simulated providers; no external requests)', async t => {
  const originalFetch = globalThis.fetch;
  let generations = 0, audits = 0, searches = 0;
  let mode: 'pass' | 'reject-once' | 'reject-always' | 'reject-distinct' | 'invalid-review' | 'empty-search' | 'catalogue-search' = 'pass';
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
      if (mode === 'invalid-review') output = { reviews: [] };
      else {
        if (mode === 'reject-always' || mode === 'reject-once' && audits === 1) { audit.reviews[0].relevant = false; audit.reviews[0].reason = 'Soal tidak menguji konsep inti anatomi.'; }
        if (mode === 'reject-distinct') { audit.reviews[0][['relevant', 'correct', 'unambiguous'][audits - 1]] = false; audit.reviews[0].reason = `Masalah kualitas berbeda pada percobaan ${audits}.`; }
        output = audit;
      }
    } else {
      generations++; generationPrompts.push(prompt);
      const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]);
      output = { title: 'Latihan anatomi', summary: 'Materi inti', questions: Array.from({ length: count }, (_, i) => ({ ...fixtures.single_choice,
        question: `Struktur anatomi ${generations}-${i}: hubungan manakah yang tepat?`, sourceUrls: [source.url] })) };
    }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(output) }] },
      ...(body.tools?.length ? { groundingMetadata: { webSearchQueries: ['anatomical relationships'], groundingChunks: [{ web: { title: source.title, uri: source.url } }] } } : {}) }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
  };
  const reset = () => { generations = 0; audits = 0; searches = 0; generationPrompts = []; mode = 'pass'; };
  try {
    await t.test('three research modes use the same fixed specification at all nine levels', async () => {
      for (const level of DIFFICULTIES) {
        const config = { ...base, difficulty: level.id };
        const research = await searchParallel(config.topic, 'fixture-parallel-quality', undefined, config);
        assert.ok(searchBody.objective.includes(base.targetAudience!) && searchBody.objective.includes(level.name));
        assert.equal(searchBody.search_queries.length, 2); assert.ok(usableResearch(research, config.topic, config));
        assert.ok(!usableResearch(research, config.topic, { ...config, targetAudience: 'Siswa SD' }));
        for (const mode of ['none', 'google', 'parallel']) {
          const quiz = await generateQuizBatch({ ...config, enableGrounding: mode !== 'none' }, 'fixture-quality-key', [], undefined, mode === 'parallel' ? research : undefined);
          assert.equal(quiz.difficulty, level.id); assert.equal(quiz.targetAudience, base.targetAudience);
          assert.equal(quiz.qualityReviews!.length, 1); assert.equal(quiz.qualityReviews![0].items.length, 1);
          assert.equal(quiz.qualityReviews![0].estimateOnly, true); assert.equal(quiz.generationMetrics![0].modelCalls, 2);
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
    await t.test('a quality failure changes the next prompt and reuses research', async () => {
      reset(); mode = 'reject-once';
      const quiz = await generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal);
      assert.equal(generations, 2); assert.equal(audits, 2); assert.equal(searches, 1);
      assert.ok(generationPrompts[1].includes('Previous attempt failed quality review') && generationPrompts[1].includes('konsep inti anatomi'));
      assert.equal(quiz.questions.length, 1); assert.equal(checkpoint!.attemptState, undefined);
    });
    await t.test('two identical failures open the circuit; resume cannot reset the budget', async () => {
      reset(); mode = 'reject-always';
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal), (e: any) => e.code === 'GENERATION_CIRCUIT_OPEN');
      assert.equal(generations, 2); assert.equal(checkpoint!.attemptState!.calls, 2); assert.equal(checkpoint!.attemptState!.repeated, 2);
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal, checkpoint!), /Batas percobaan/);
      assert.equal(generations, 2); assert.equal(searches, 1);
    });
    await t.test('invalid audit fails closed without repeating calls', async () => {
      reset(); mode = 'invalid-review';
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal), (e: any) => e.code === 'QUALITY_REVIEW_INVALID');
      assert.equal(generations, 1); assert.equal(audits, 1);
    });
    await t.test('distinct diagnosed failures share a three-attempt limit across resume', async () => {
      reset(); mode = 'reject-distinct';
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal), (e: any) => e.code === 'QUALITY_REJECTED');
      assert.equal(generations, 3); assert.equal(audits, 3); assert.equal(checkpoint!.attemptState!.calls, 3);
      assert.equal(checkpoint!.attemptState!.repeated, 1); assert.ok(generationPrompts[2].includes('percobaan 2'));
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys, localRepository, save, new AbortController().signal, checkpoint!), /Batas percobaan/);
      assert.equal(generations, 3);
    });
    await t.test('empty and irrelevant search fall back for stable material; warning and checkpoints survive batches', async () => {
      for (const scenario of ['empty-search', 'catalogue-search'] as const) {
        reset(); mode = scenario;
        const quiz = await generateWorkspaceQuiz({ ...base, questionCount: 6, questionDistribution: { single_choice: 6 } }, preferences, keys, localRepository, save, new AbortController().signal);
        assert.equal(searches, 1); assert.equal(generations, 2); assert.equal(quiz.usedGrounding, false);
        assert.equal(quiz.groundingFallbackUsed, true); assert.equal(quiz.qualityReviews!.length, 2);
        assert.ok(quiz.generationWarnings![0].includes('tanpa referensi web')); assert.ok(checkpoint!.parallelFallback);
      }
    });
    await t.test('current facts never fall back to unsupported knowledge', async () => {
      reset(); mode = 'empty-search';
      await assert.rejects(generateWorkspaceQuiz({ ...base, topic: 'Pedoman terapi terbaru' }, preferences, keys, localRepository, save, new AbortController().signal), (e: any) => e.code === 'PARALLEL_SEARCH_EMPTY');
      assert.equal(generations, 0); assert.equal(audits, 0);
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

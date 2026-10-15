import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { QuizResults } from '../src/components/QuizResults.js';
import { QuestionReview } from '../src/components/QuestionReview.js';
import { TopBar } from '../src/components/TopBar.js';
import { matchesReviewFilter, questionScore, questionStatusLabel, reviewFilters, reviewStatus, reviewStatusLabel } from '../src/resultPresentation.js';
import { scoreQuestion } from '../src/scoring.js';
import { exportJSON } from '../src/quizStorage.js';
import { answerDiscussionLink, buildAnswerDiscussionPrompt, copyDiscussionPrompt } from '../src/answerDiscussion.js';
import { quizRegeneration } from '../src/quizRegeneration.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { reviewFixture, reviewQuestions, type ReviewScenario } from './results-review-fixture.js';
import type { Question, QuestionEvaluation, StoredAnswer } from '../src/types/quiz.js';

const render = (q: Question, answer?: StoredAnswer, e = scoreQuestion(q, answer)) => renderToStaticMarkup(React.createElement(QuestionReview, { question: q, answer, evaluation: e }));
const count = (html: string, className: string) => (html.match(new RegExp(`class="${className}(?: |")`, 'g')) ?? []).length;

test('A–C: all choice options stay in source order; selected/correct/partial states stay distinct', () => {
  const single = reviewQuestions[0];
  for (const answer of [0, 1, -1, undefined]) {
    const html = render(single, answer);
    assert.equal(count(html, 'review-option'), 5);
    let last = -1;
    for (const text of single.options!) { const index = html.indexOf(text); assert.ok(index > last); last = index; }
    assert.equal((html.match(/review-option correct-option/g) ?? []).length, 1);
    if (answer === 0) assert.match(html, /Jawaban benar[\s\S]*Pilihan Anda/);
    if (answer === 1) assert.match(html, /review-option wrong-option[\s\S]*Pilihan Anda · Salah/);
  }
  for (const options of [single.options!.slice(0, 4), [...single.options!, 'Six', 'Seven', 'Eight']]) {
    assert.equal(count(render({ ...single, options }), 'review-option'), options.length);
  }
  const multi = reviewQuestions[1]; assert.equal(multi.type, 'multiple_select');
  if (multi.type !== 'multiple_select') return;
  for (const correctOptionIds of [['o0', 'o4'], ['o0', 'o1', 'o4'], ['o0', 'o1', 'o2', 'o4']]) {
    const q = { ...multi, correctOptionIds };
    for (let mask = 0; mask < 32; mask++) {
      const selectedOptionIds = Array.from({ length: 5 }, (_, i) => 'o' + i).filter((_, i) => mask & (1 << i));
      const answer = { type: 'multiple_select' as const, selectedOptionIds }, e = scoreQuestion(q, answer), html = render(q, answer, e);
      assert.equal(count(html, 'review-option'), 5);
      assert.equal((html.match(/Jawaban benar/g) ?? []).length, correctOptionIds.length);
      assert.equal((html.match(/Pilihan Anda/g) ?? []).length, selectedOptionIds.length);
      assert.ok(e.earnedPoints! >= 0 && e.earnedPoints! <= e.maxPoints);
      if (e.earnedPoints! > 0 && e.earnedPoints! < e.maxPoints) assert.equal(reviewStatus(e), 'partial');
    }
  }
});
test('D–F: true/false, long/blank written answers and five rubric criteria are complete', () => {
  const tf = reviewQuestions[2];
  for (const value of [true, false, null]) {
    const html = render(tf, { type: 'true_false', value });
    assert.equal(count(html, 'review-option'), 2); assert.match(html, /<p>Benar<\/p>/); assert.match(html, /<p>Salah<\/p>/);
  }
  for (const scenario of ['final', 'unanswered'] as const) {
    const result = reviewFixture(scenario);
    for (const q of result.quiz.questions.filter(q => q.type === 'short_answer' || q.type === 'essay')) {
      const html = render(q, result.submission.userAnswers[q.id], result.evaluations![q.id]);
      assert.ok(html.includes(q.referenceAnswer)); assert.match(html, /Jawaban Anda/);
      if (scenario === 'unanswered') assert.match(html, /Belum dijawab/);
      if (q.type === 'short_answer') { q.acceptedAnswers.forEach(t => assert.ok(html.includes(t))); q.requiredConcepts.forEach(t => assert.ok(html.includes(t))); }
      if (q.type === 'essay') {
        assert.equal((html.match(/Bobot 20%/g) ?? []).length, 5);
        q.rubric.forEach(c => { assert.ok(html.includes(c.description)); c.anchors.forEach(t => assert.ok(html.includes(t))); });
        if (scenario === 'final') assert.equal((html.match(/Bukti jawaban:/g) ?? []).length, 5);
      }
    }
  }
});
test('G–H: matching distractors and all ordering items survive 3–8 item fixtures', () => {
  for (let n = 3; n <= 8; n++) {
    const matching = reviewQuestions[5]; assert.equal(matching.type, 'matching');
    if (matching.type !== 'matching') return;
    const leftItems = Array.from({ length: n }, (_, i) => ({ id: 'l' + i, text: 'Left_' + i }));
    const rightItems = Array.from({ length: n + 1 }, (_, i) => ({ id: 'r' + i, text: 'Right_' + i }));
    const correctPairs = Object.fromEntries(leftItems.map((l, i) => [l.id, rightItems[i].id]));
    const html = render({ ...matching, leftItems, rightItems, correctPairs }, { type: 'matching', pairs: { l0: 'r0' } });
    [...leftItems, ...rightItems].forEach(i => assert.ok(html.includes(i.text))); assert.match(html, /Belum dipasangkan/);
    const ordering = reviewQuestions[6]; assert.equal(ordering.type, 'ordering');
    if (ordering.type !== 'ordering') return;
    const items = Array.from({ length: n }, (_, i) => ({ id: 'i' + i, text: 'Item_' + i })), correctOrder = items.map(i => i.id);
    for (const confirmed of [false, true]) {
      const html = render({ ...ordering, items, correctOrder }, { type: 'ordering', orderedItemIds: [...correctOrder].reverse(), confirmed });
      items.forEach(i => assert.equal((html.match(new RegExp(i.text, 'g')) ?? []).length, 2));
      assert.ok(html.includes(confirmed ? 'Urutan Anda · Dikonfirmasi' : 'Belum ada urutan jawaban yang dikonfirmasi'));
    }
  }
});
test('I–J: six filters preserve non-final states and match source counts', () => {
  assert.equal(reviewFilters.length, 6);
  for (const scenario of ['pending', 'failed', 'cancelled', 'needs_review'] as const) {
    const result = reviewFixture(scenario), e = result.evaluations!.essay;
    assert.equal(reviewStatus(e), 'pending'); assert.equal(matchesReviewFilter(e, 'incorrect'), false);
    assert.ok(matchesReviewFilter(e, 'pending')); assert.notEqual(reviewStatusLabel(e), 'Salah');
    const html = renderToStaticMarkup(React.createElement(QuizResults, { result, onRetake() {}, onNewQuiz() {} }));
    assert.match(html, /Skor · Belum final/); assert.match(html, /result-score-value"><strong>—/);
  }
  const result = reviewFixture(), es = Object.values(result.evaluations!);
  assert.deepEqual(reviewFilters.map(f => es.filter(e => matchesReviewFilter(e, f.id)).length), [7, 2, 4, 1, 0, 0]);
  const review: QuestionEvaluation = { ...es[0], status: 'needs_review', earnedPoints: 1 };
  assert.equal(reviewStatus(review), 'pending');
});
test('K–L: render is read-only, scoring snapshots unchanged and busy guards remain', () => {
  const expected: Record<string, [number, number | null, number, number, number, number, number, number]> = {
    final: [69.7, 69.7, 15.3334, 2, 4, 1, 0, 0], pending: [24.24, null, 5.3334, 1, 3, 1, 0, 2],
    failed: [24.24, null, 5.3334, 1, 3, 1, 0, 2], cancelled: [24.24, null, 5.3334, 1, 3, 1, 0, 2],
    needs_review: [24.24, null, 5.3334, 1, 3, 1, 0, 2], unanswered: [0, 0, 0, 0, 0, 0, 7, 0],
    manual: [74.24, 74.24, 16.3334, 2, 4, 1, 0, 0], long: [69.7, 69.7, 15.3334, 2, 4, 1, 0, 0],
  };
  for (const scenario of Object.keys(expected) as ReviewScenario[]) {
    const result = reviewFixture(scenario), original = JSON.stringify(result);
    assert.deepEqual([result.score, result.finalScore, Number(result.earnedPoints!.toFixed(4)), result.correctCount, result.partialCount, result.incorrectCount, result.unansweredCount, result.pendingCount], expected[scenario]);
    const html = renderToStaticMarkup(React.createElement(QuizResults, { result, onRetake() {}, onNewQuiz() {}, isEvaluating: true, onReview() {}, onEvaluate() {} }));
    assert.equal(JSON.stringify(result), original); assert.equal(count(html, 'review-card'), 7);
    assert.match(html, /disabled="" aria-label="Remedial"/);
    assert.match(html, /disabled="" aria-label="Generate ulang"/);
    assert.ok(!html.includes('aria-label="Kuis baru"'), 'New quiz action lives once in the header');
    assert.ok(!html.includes('Tinjau / sesuaikan nilai')); assert.ok(!html.includes('Nilai ulang soal ini'));
  }
  const result = reviewFixture('manual'), html = render(result.quiz.questions[4], result.submission.userAnswers.essay, result.evaluations!.essay);
  assert.match(html, /Riwayat penilaian · Revisi 1/); assert.ok(html.includes(result.evaluations!.essay.manualReason!)); assert.match(html, /80\/100 · ai/);
  const withEarlierManual = { ...result.evaluations!.essay, previous: [{ ...result.evaluations!.essay, feedback: 'Feedback revisi sebelumnya.', manualReason: 'Alasan revisi sebelumnya.' }] };
  const auditHtml = render(result.quiz.questions[4], result.submission.userAnswers.essay, withEarlierManual);
  assert.ok(auditHtml.includes('Feedback revisi sebelumnya.')); assert.ok(auditHtml.includes('Alasan revisi sebelumnya.'));
  const topbar = renderToStaticMarkup(React.createElement(TopBar, { activeView: 'results', isBusy: true, onNavigate() {}, onOpenSettings() {}, storageLabel: 'QA', isKeyConfigured: true, onNewQuizClick() {} }));
  assert.match(topbar, /disabled="" aria-label="Kuis baru"/);
  assert.equal((topbar.match(/aria-label="Kuis baru"/g) ?? []).length, 1);
  assert.ok(!topbar.includes('> Beranda'), 'The brand already navigates home in the results view');
  const summary = renderToStaticMarkup(React.createElement(QuizResults, { result: reviewFixture(), onRetake() {}, onNewQuiz() {} }));
  assert.equal(count(summary, 'result-count'), 3, 'Zero-count statuses are omitted');
  assert.ok(!summary.includes('title="Belum final: 0"'));
  assert.ok(!summary.includes('title="Belum dijawab: 0"'));
});
test('Export JSON retains exact nested answers, evaluations, revisions and source metadata', async () => {
  const originalURL = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalDocument = globalThis.document;
  let blob: Blob | undefined, clicked = false;
  const anchor = { href: '', download: '', click() { clicked = true; } };
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:fixture'; }; URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: () => anchor } as any;
  try {
    const result = reviewFixture('manual'); exportJSON('fixture.json', result);
    assert.ok(clicked); assert.equal(anchor.download, 'fixture.json');
    // JSON intentionally omits undefined optional fields; compare the existing serialized contract.
    assert.equal(await blob!.text(), JSON.stringify(result, null, 2));
  } finally { URL.createObjectURL = originalURL; URL.revokeObjectURL = originalRevoke; globalThis.document = originalDocument; }
});
test('Rules frontmatter and print safeguards persist', () => {
  const rules = readFileSync('.agents/rules/anti-loop.md', 'utf8');
  assert.match(rules, /^---\r?\ntrigger: always_on\r?\ndescription: "[^"\n]+"\r?\n---/);
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /@media print[\s\S]*\.results-page \.review-filtered \{ display: block;/);
  assert.match(css, /\.results-page \.result-score-value strong \{ font-size: 60px; color: black; background: none; -webkit-text-fill-color: black;/);
  const motionCss = readFileSync('src/styles/motion.css', 'utf8');
  assert.match(motionCss, /@media print[\s\S]*animation: none !important; transition: none !important;/);
});

test('Answer discussion preserves all seven types and safely encodes complete prompts', () => {
  const result = reviewFixture('manual'), original = JSON.stringify(result);
  for (const q of result.quiz.questions) {
    const prompt = buildAnswerDiscussionPrompt(q, result.submission.userAnswers[q.id], result.evaluations![q.id], result.quiz.title);
    assert.ok(prompt.includes(q.question)); assert.ok(prompt.includes(q.explanation)); assert.ok(prompt.includes(result.quiz.title));
    if (q.type === undefined || q.type === 'single_choice' || q.type === 'multiple_select') q.options.forEach(option => assert.ok(prompt.includes(option)));
    if (q.type === 'matching') [...q.leftItems, ...q.rightItems].forEach(item => assert.ok(prompt.includes(item.text)));
    if (q.type === 'ordering') q.items.forEach(item => assert.ok(prompt.includes(item.text)));
    if (q.type === 'essay') q.rubric.forEach(c => assert.ok(prompt.includes(c.description)));
    const link = answerDiscussionLink(prompt);
    assert.equal(new URL(link.href).origin, 'https://chatgpt.com');
    if (!link.requiresPaste) assert.equal(new URL(link.href).searchParams.get('q'), prompt);
  }
  assert.equal(JSON.stringify(result), original);
  const unicode = 'Jawaban: benar & salah? # αβ\nPerbandingan 50% / 100%';
  assert.equal(new URL(answerDiscussionLink(unicode).href).searchParams.get('q'), unicode);
  const long = 'Esai lengkap. '.repeat(2000), fallback = answerDiscussionLink(long);
  assert.equal(fallback.requiresPaste, true); assert.equal(fallback.href, 'https://chatgpt.com/');
  const blank = reviewFixture('unanswered');
  const ordering = blank.quiz.questions[6], prompt = buildAnswerDiscussionPrompt(ordering, blank.submission.userAnswers.ordering, blank.evaluations!.ordering);
  assert.match(prompt, /belum dikonfirmasi, bukan jawaban final/);
  const rendered = renderToStaticMarkup(React.createElement(QuizResults, { result, onRetake() {}, onNewQuiz() {} }));
  assert.equal((rendered.match(/aria-label="Bedah jawaban soal \d+ di ChatGPT"/g) ?? []).length, 7);
  assert.equal((rendered.match(/rel="noopener noreferrer"/g) ?? []).length >= 7, true);
});

test('Discussion clipboard copies the complete prompt and handles denied/unavailable access', async () => {
  const prompt = 'Bedah esai:\n' + 'Isi lengkap α & β. '.repeat(2000);
  let copied = '';
  assert.equal(await copyDiscussionPrompt(prompt, { async writeText(text) { copied = text; } }), true);
  assert.equal(copied, prompt);
  assert.equal(await copyDiscussionPrompt(prompt), false);
  assert.equal(await copyDiscussionPrompt(prompt, { async writeText() { throw new Error('NotAllowedError'); } }), false);
});

test('Question scores use a 100 scale; binary badges and result utilities stay concise', () => {
  assert.equal(questionScore(8, 10), 80); assert.equal(questionScore(1, 2), 50);
  assert.equal(questionScore(0, 2), 0); assert.equal(questionScore(null, 10), null);
  assert.equal(questionScore(.6667, 2), 33.34);
  const result = reviewFixture();
  assert.equal(questionStatusLabel(result.quiz.questions[0], result.evaluations!.single), 'Salah');
  assert.equal(questionStatusLabel(result.quiz.questions[2], result.evaluations!.boolean), 'Benar');
  assert.equal(questionStatusLabel(result.quiz.questions[4], result.evaluations!.essay), 'Sebagian benar · 80/100');
  const html = renderToStaticMarkup(React.createElement(QuizResults, { result, onRetake() {}, onNewQuiz() {}, onReview() {} }));
  assert.ok(!html.includes('Ke pembahasan')); assert.ok(!html.includes('Poin terkonfirmasi'));
  assert.ok(!html.includes('Gunakan pembahasan dan rubrik untuk menentukan materi yang perlu dipelajari kembali.'));
  assert.match(html, /aria-label="Cetak" title="Cetak"/);
  assert.match(html, /aria-label="Ekspor jawaban &amp; hasil" title="Ekspor jawaban &amp; hasil"/);
  assert.ok(!html.includes('>Cetak<')); assert.ok(!html.includes('>Ekspor jawaban &amp; hasil<'));
  assert.match(html, /Nilai \(0–100\)/); assert.match(html, /max="100"/);
});

test('Regeneration preserves the original full config/preferences, including after JSON reload', () => {
  const prefs = { ...emptyWorkspace().preferences, grounding: false };
  const config = normalizeQuizConfig({ topic: 'Konsep', studyMaterial: 'Materi asli, bukan draft saat ini.', difficulty: 'hard', questionCount: 7,
    questionDistribution: Object.fromEntries(reviewQuestions.map(q => [q.type!, 1])), pointsByType: { essay: 10 }, partialCredit: true,
    displayMode: 'sequential', timeLimitMinutes: 15, timePerQuestionSeconds: 40, timePerQuestionByType: { essay: 120 },
    language: 'en', languageStyle: 'Academic', additionalInstructions: 'Focus on structure.', evaluationSettings: prefs.evaluation, model: prefs.model, enableGrounding: false });
  const quiz = { ...reviewFixture().quiz, generationConfig: config, generationPreferences: prefs };
  const original = JSON.stringify(quiz), restored = JSON.parse(original);
  const next = quizRegeneration(restored, { ...prefs, grounding: true, keyId: 'different-key' });
  assert.deepEqual(next.config, config); assert.deepEqual(next.preferences, prefs); assert.equal(next.exact, true);
  next.config.studyMaterial = 'Changed copy'; assert.equal(restored.generationConfig.studyMaterial, config.studyMaterial);
  assert.equal(JSON.stringify(quiz), original);
  const legacy = quizRegeneration({ ...reviewFixture().quiz, model: prefs.model }, prefs);
  assert.equal(legacy.exact, false); assert.equal(legacy.config.questionCount, 7);
  assert.deepEqual(legacy.config.questionDistribution, Object.fromEntries(reviewQuestions.map(q => [q.type!, 1])));
  const html = renderToStaticMarkup(React.createElement(QuizResults, { result: reviewFixture(), onRetake() {}, onNewQuiz() {}, onRegenerate() {} }));
  assert.ok(!html.includes('result-score-watermark')); assert.ok(!html.includes('Kerjakan ulang'));
  assert.match(html, /aria-label="Generate ulang"/); assert.match(html, /aria-label="Remedial"/);
});

import assert from 'node:assert/strict';
import { buildComposerConfig, configurationState } from '../src/configurationState.js';
import { restoreComposerDraft } from '../src/composerDraft.js';
import { QUESTION_TYPES, type AnswerValue, type QuestionType, type QuizSubmission } from '../src/types/quiz.js';
import { questionType, optionIds, validateAnswer } from '../src/questionState.js';
import { generateQuiz } from '../src/server/aiService.js';
import { evaluateQuiz } from '../src/server/evaluationService.js';
import { buildResult, scoreQuestion } from '../src/scoring.js';
import { quizTimerSeconds } from '../src/quizConfig.js';
import { KeyPool, defaultSettings } from '../src/keyPool.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { fixtures } from './assessment-fixtures.js';

// Full configuration → generation → answering → evaluation → result, without external calls.
const originalFetch = globalThis.fetch;
let serial = 0;
const prompts: string[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init); request.signal.throwIfAborted();
  const body = await request.json();
  const prompt = body.contents?.[0]?.parts?.map((part: any) => part.text ?? '').join('\n') ?? '';
  prompts.push(prompt);
  let value: unknown;
  if (prompt.includes('DATA: ')) {
    const data = JSON.parse(prompt.split('DATA: ').at(-1)!);
    value = { results: data.map((q: any) => ({ questionId: q.questionId, criteria: q.rubric.map((criterion: any) => ({ criterionId: criterion.id, level: 1, evidence: q.answer.text.slice(0, 40), feedback: 'Konsep sesuai rubrik.' })), feedback: 'Jawaban lengkap.', reviewFlags: [] })) };
  } else {
    const type = (/Tipe: (\w+)/.exec(prompt)?.[1] ?? 'single_choice') as QuestionType;
    const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1] ?? 1);
    value = { title: 'Astronomi', topic: 'Astronomi', summary: 'Latihan', questions: Array.from({ length: count }, () => ({ ...fixtures[type], question: `Pertanyaan ${type} nomor ${++serial} tentang konsep?` })) };
  }
  return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] });
};
const pool = new KeyPool({ keys: [{ id: 'fixture', name: 'Fixture', provider: 'gemini', key: 'fake-test-only', project: 'fixture', priority: 1, enabled: true }], settings: { ...defaultSettings } });
const preferences = { ...emptyWorkspace().preferences, grounding: false };
const composition = { mode: 'mixed', type: 'single_choice', distribution: Object.fromEntries(QUESTION_TYPES.map(type => [type, 1])), points: Object.fromEntries(QUESTION_TYPES.map((type, i) => [type, i + 1])), partialCredit: true, times: { essay: 0, matching: 180 } };
const draft = restoreComposerDraft({ topic: 'Astronomi', composition, displayMode: 'sequential', totalMinutes: '20', perQuestionSeconds: '90', languageStyle: 'Teknis & presisi', languageStyleMode: 'preset' });
try {
  const config = buildComposerConfig(draft, preferences), generated = await generateQuiz(config, undefined, { pool });
  assert.equal(generated.questions.length, 7); assert.equal(configurationState(draft).totalPoints, 28);
  assert.equal(generated.timePerQuestionByType?.essay, 0); assert.equal(generated.timePerQuestionByType?.matching, 180);
  assert.equal(quizTimerSeconds(generated), 90);
  assert.ok(prompts.every(prompt => prompt.includes('terminologi teknis')));
  const answers = Object.fromEntries(generated.questions.map(q => {
    const type = questionType(q);
    let answer: AnswerValue;
    switch (q.type) {
      case 'multiple_select': answer = { type, selectedOptionIds: [...q.correctOptionIds] } as AnswerValue; break;
      case 'true_false': answer = { type, value: q.correctValue } as AnswerValue; break;
      case 'short_answer': answer = { type, text: q.acceptedAnswers[0] } as AnswerValue; break;
      case 'essay': answer = { type, text: 'Jawaban konsep saya lengkap dengan penalaran dan cakupan.' } as AnswerValue; break;
      case 'matching': answer = { type, pairs: { ...q.correctPairs } } as AnswerValue; break;
      case 'ordering': answer = { type, orderedItemIds: [...q.correctOrder], confirmed: true } as AnswerValue; break;
      default: answer = { type: 'single_choice', selectedOptionId: optionIds(q)[q.correctAnswerIndex] };
    }
    assert.ok(validateAnswer(q, answer));
    assert.equal(q.maxPoints, config.pointsByType?.[type]);
    return [q.id, answer];
  }));
  const submission: QuizSubmission = { quizId: generated.id, attemptId: 'test-attempt', userAnswers: answers, bookmarkedQuestions: [], timeTakenSeconds: 123, completedAt: new Date().toISOString() };
  const before = buildResult(generated, submission); assert.equal(before.totalPoints, 28); assert.equal(before.pendingCount, 1);
  const essay = generated.questions.find(q => q.type === 'essay')!;
  const evaluated = await evaluateQuiz({ quiz: generated, submission, settings: { ...defaultEvaluationSettings }, targetQuestionIds: [essay.id] }, { pool });
  const result = buildResult(generated, submission, { ...before.evaluations, ...evaluated });
  assert.equal(result.totalPoints, 28); assert.equal(result.earnedPoints, 28); assert.equal(result.finalScore, 100);
  const multiple = generated.questions.find(q => q.type === 'multiple_select')!;
  if (multiple.type === 'multiple_select') assert.equal(scoreQuestion(multiple, { type: 'multiple_select', selectedOptionIds: [multiple.correctOptionIds[0]] }).earnedPoints, 1);
  const matching = generated.questions.find(q => q.type === 'matching')!;
  if (matching.type === 'matching') assert.equal(scoreQuestion(matching, { type: 'matching', pairs: { [matching.leftItems[0].id]: matching.correctPairs[matching.leftItems[0].id] } }).earnedPoints, 2);
  const reloaded = JSON.parse(JSON.stringify(result));
  assert.deepEqual(reloaded.submission.userAnswers, answers); assert.equal(reloaded.totalPoints, configurationState(draft).totalPoints);
  assert.equal(reloaded.quiz.timePerQuestionByType.essay, 0); assert.equal(reloaded.quiz.questions.find((q: any) => q.type === 'essay').rubric.length, 3);
  for (const type of QUESTION_TYPES) {
    const one = restoreComposerDraft({ ...draft, composition: { ...composition, mode: 'single', type, singleCounts: { [type]: 1 } } });
    const oneConfig = buildComposerConfig(one, preferences), quiz = await generateQuiz(oneConfig, undefined, { pool });
    assert.equal(quiz.questions.length, 1); assert.equal(questionType(quiz.questions[0]), type); assert.equal(quiz.questions[0].maxPoints, oneConfig.pointsByType?.[type]);
  }
  console.log('PASS: real config → generator → seven answer types → rubric evaluation → weighted results (28/28, 100), partial credit, zero/positive overrides, JSON roundtrip, all single-type generation. Provider responses simulated; no external requests.');
} finally { globalThis.fetch = originalFetch; pool.lock(); }

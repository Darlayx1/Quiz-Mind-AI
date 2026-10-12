import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { QUESTION_TYPES } from '../src/types/quiz.js';
import { activeQuestionTypes, allocatedCount, compositionError, defaultComposition, effectiveCount, equalDistribution } from '../src/questionComposition.js';
import { QuestionComposition } from '../src/components/QuestionComposition.js';
import { QuestionScoring } from '../src/components/QuestionScoring.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';

for (let total = 7; total <= 100; total++) {
  const distribution = equalDistribution([...QUESTION_TYPES].reverse(), total);
  assert.equal(Object.values(distribution).reduce((sum, n) => sum + n!, 0), total);
  assert.ok(Math.max(...Object.values(distribution) as number[]) - Math.min(...Object.values(distribution) as number[]) <= 1);
  const mixed = { ...defaultComposition, mode: 'mixed' as const, distribution };
  assert.equal(effectiveCount(mixed, total), total); assert.equal(compositionError(mixed, total), '');
  assert.equal(normalizeQuizConfig({ topic: 'Fixture', questionCount: total, questionDistribution: distribution }).questionCount, total);
}
assert.deepEqual(equalDistribution(['essay', 'single_choice', 'matching'], 10), { single_choice: 4, essay: 3, matching: 3 });
assert.deepEqual(equalDistribution([], 10), {}); assert.deepEqual(equalDistribution(QUESTION_TYPES, 3), {});
const mixed = { ...defaultComposition, mode: 'mixed' as const, distribution: { single_choice: 3, essay: 4 } };
assert.equal(allocatedCount(mixed), 7); assert.deepEqual(activeQuestionTypes(mixed), ['single_choice', 'essay']);
assert.match(compositionError(mixed, 10), /7 dari 10/);
assert.match(compositionError({ ...mixed, distribution: {} }, 10), /minimal satu/);
assert.match(compositionError({ ...mixed, distribution: { essay: 101 } }, 10), /0–100/);
assert.match(compositionError({ ...mixed, distribution: { essay: 60, matching: 50 } }, 100), /melebihi/);
assert.match(compositionError({ ...mixed, distribution: { essay: 1.5 } }, 10), /bilangan bulat/);
assert.match(compositionError(mixed, NaN), /bilangan bulat/);
assert.match(compositionError({ ...defaultComposition, type: 'unknown' as any }, 10), /tipe soal/);
const markup = renderToStaticMarkup(createElement(QuestionComposition, { value: defaultComposition, onChange() {}, count: 10 }));
assert.equal((markup.match(/name="question-type"/g) || []).length, 7);
assert.equal((markup.match(/CONTOH LOKAL/g) || []).length, 7);
const scoring = (type: typeof QUESTION_TYPES[number]) => renderToStaticMarkup(createElement(QuestionScoring, { value: { ...defaultComposition, type }, onChange() {}, evaluator: defaultEvaluationSettings, onOpen() {} }));
assert.ok(!scoring('single_choice').includes('Berikan kredit parsial'));
assert.ok(scoring('multiple_select').includes('Berikan kredit parsial'));
assert.ok(scoring('ordering').includes('Berikan kredit parsial'));
assert.ok(scoring('matching').includes('per pasangan'));
assert.ok(scoring('essay').includes('Kelola Evaluasi AI'));
console.log('PASS: deterministic allocations 7–100, generator compatibility, invalid/empty/mismatched totals, seven native gallery choices/local previews, contextual scoring.');

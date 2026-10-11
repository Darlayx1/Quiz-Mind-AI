import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateGenerationGate } from './generation-quality-gate.js';
import { fixtures } from './assessment-fixtures.js';
import { QUESTION_TYPES, type QuestionType } from '../src/types/quiz.js';

// Synthetic gate fixtures exercise decisions; they are not real quality evidence.
const results: any[] = [];
for (const caseId of ['newton-10', 'mixed-7', 'essay-2']) for (let repetition = 0; repetition < 2; repetition++) {
  const types: QuestionType[] = caseId === 'mixed-7' ? QUESTION_TYPES : caseId === 'essay-2' ? ['essay', 'essay'] : Array(10).fill('single_choice');
  const config = { model: 'gemini-3.8-flash', topic: caseId, difficulty: 'hard', questionCount: types.length,
    questionDistribution: Object.fromEntries(QUESTION_TYPES.map(type => [type, types.filter(t => t === type).length])) };
  for (const variant of ['baseline-high', 'focused-high', 'focused-medium']) results.push({ caseId, repetition, variant, config,
    configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
    blindId: `${caseId}/${repetition}/${variant}`, quiz: { questions: types.map((type, index) => ({ ...fixtures[type], type, question: `Question ${index} unique concept?` })) }, elapsedMs: variant === 'baseline-high' ? 100000 : 50000,
    metrics: [{ modelCalls: 1, transport: 'stream', strategy: variant, thinkingLevel: variant === 'focused-medium' ? 'MEDIUM' : 'HIGH' }] });
}
const data = { manifest: { model: 'gemini-3.8-flash', repetitions: 2 }, results };
const review = { reviewer: 'Fixture reviewer', reviewedAt: '2026-10-11T00:00:00Z', items: results.map(r => ({
  id: r.blindId, config: r.config, quiz: r.quiz, criticalErrors: [],
  scores: { factual: 4, answerKey: 4, explanation: 4, ambiguity: 4, difficulty: 4, coverage: 4 } })) };
const eligible = evaluateGenerationGate(data, review);
assert.equal(eligible.productionChanged, false);
assert.ok(eligible.candidates.every(c => c.eligibleForControlledRollout));
const checkBlocked = (change: (d: any, r: any) => void) => {
  const d = structuredClone(data); const r = structuredClone(review); change(d, r);
  assert.ok(evaluateGenerationGate(d, r).candidates.every(c => !c.eligibleForControlledRollout));
};
checkBlocked((_, r) => { r.reviewer = null; });
checkBlocked((_, r) => { r.items[1].criticalErrors = ['Incorrect answer']; });
checkBlocked((_, r) => { r.items[1].scores.factual = null; });
checkBlocked((d) => { d.manifest.repetitions = 1; });
checkBlocked((d) => { d.results[1].config.topic = 'Changed material'; });
checkBlocked((d) => { d.results[1].metrics[0].modelCalls = 2; });
checkBlocked((d, r) => { d.results.pop(); r.items.pop(); });
checkBlocked((_, r) => { r.items[1].quiz = { questions: ['Replaced content'] }; });
checkBlocked((d) => { d.results[1].error = { code: 'TIMEOUT' }; });
checkBlocked((d, r) => { d.results[1].quiz.questions.pop(); r.items[1].quiz = d.results[1].quiz; });
const regressed = structuredClone(review); regressed.items[1].scores.explanation = 3;
const decision = evaluateGenerationGate(data, regressed);
assert.equal(decision.candidates.find(c => c.variant === 'focused-high')!.eligibleForControlledRollout, false);
assert.equal(decision.candidates.find(c => c.variant === 'focused-medium')!.eligibleForControlledRollout, true);
const slower = structuredClone(data); slower.results.filter(r => r.variant !== 'baseline-high').forEach(r => { r.elapsedMs = 90000; });
assert.ok(evaluateGenerationGate(slower, review).candidates.every(c => !c.eligibleForControlledRollout));
console.log('PASS: missing review/coverage, critical errors, quality regression, altered inputs, extra calls and insufficient speedup block promotion. Gate never modifies production.');

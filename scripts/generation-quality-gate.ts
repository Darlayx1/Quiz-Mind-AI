import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateQuestion } from '../src/questionValidation.js';
import { QUESTION_TYPES } from '../src/types/quiz.js';

export function evaluateGenerationGate(data: any, review: any) {
  const blockers: string[] = [];
  const dimensions = ['factual', 'answerKey', 'explanation', 'ambiguity', 'difficulty', 'coverage'];
  const cases = ['newton-10', 'mixed-7', 'essay-2'];
  const variants = ['baseline-high', 'focused-high', 'focused-medium'];
  const records = data?.results ?? [];
  const items = review?.items ?? [];
  if (!review?.reviewer?.trim() || !review?.reviewedAt || !Number.isFinite(Date.parse(review.reviewedAt))) blockers.push('Independent human reviewer and date required.');
  if (data?.manifest?.model !== 'gemini-3.8-flash' || data?.manifest?.repetitions !== 2) blockers.push('Full matched benchmark required; pilot evidence is insufficient.');
  if (new Set(records.map((r: any) => r.blindId)).size !== records.length || new Set(items.map((r: any) => r.id)).size !== items.length) blockers.push('Duplicate identities.');
  if (items.length !== records.length || items.some((i: any) => !records.some((r: any) => r.blindId === i.id))) blockers.push('Missing or foreign review items.');
  for (const r of records) {
    const item = items.find((i: any) => i.id === r.blindId);
    if (r.error || !r.quiz || !Number.isFinite(r.elapsedMs) || r.elapsedMs <= 0) blockers.push(`Failed or incomplete generation: ${r.blindId}`);
    if (r.configHash !== createHash('sha256').update(JSON.stringify(r.config)).digest('hex') || r.config?.model !== 'gemini-3.8-flash') blockers.push(`Configuration mismatch: ${r.blindId}`);
    const questions = r.quiz?.questions;
    const distribution = r.config?.questionDistribution ?? { [r.config?.questionType ?? 'single_choice']: r.config?.questionCount };
    if (!Array.isArray(questions) || questions.length !== r.config?.questionCount
      || questions.some((q: any, index: number) => !validateQuestion(q, index, r.config.topic, [], q.type ?? r.config.questionType ?? 'single_choice'))
      || new Set(questions.map((q: any) => q.question.trim().toLowerCase())).size !== questions.length
      || QUESTION_TYPES.some(type => questions.filter((q: any) => (q.type ?? 'single_choice') === type).length !== (distribution[type] ?? 0))) blockers.push(`Structural contract failed: ${r.blindId}`);
    if (r.caseId === 'newton-10' && (r.config?.questionCount !== 10 || distribution.single_choice !== 10)
      || r.caseId === 'mixed-7' && QUESTION_TYPES.some(type => distribution[type] !== 1)
      || r.caseId === 'essay-2' && (r.config?.questionCount !== 2 || distribution.essay !== 2 || r.config?.difficulty !== 'hard')) blockers.push(`Case coverage mismatch: ${r.blindId}`);
    if (!item || JSON.stringify(item.config) !== JSON.stringify(r.config) || JSON.stringify(item.quiz) !== JSON.stringify(r.quiz)) blockers.push(`Review content mismatch: ${r.blindId}`);
    if (!item || dimensions.some(d => !Number.isInteger(item.scores?.[d]) || item.scores[d] < 0 || item.scores[d] > 4) || !Array.isArray(item.criticalErrors)) blockers.push(`Incomplete human scores: ${r.blindId}`);
    else if (item.criticalErrors.length || dimensions.some(d => item.scores[d] < 3)) blockers.push(`Quality threshold failed: ${r.blindId}`);
    const m = r.metrics?.[0];
    if (!m || r.metrics.length !== 1 || m.modelCalls !== 1 || m.transport !== 'stream' || m.strategy !== r.variant || m.thinkingLevel !== (r.variant === 'focused-medium' ? 'MEDIUM' : 'HIGH')) blockers.push(`Execution contract mismatch: ${r.blindId}`);
  }
  for (const c of cases) for (let repetition = 0; repetition < 2; repetition++) {
    const group = records.filter((r: any) => r.caseId === c && r.repetition === repetition);
    if (group.length !== 3 || variants.some(v => group.filter((r: any) => r.variant === v).length !== 1) || new Set(group.map((r: any) => r.configHash)).size !== 1) blockers.push(`Missing matched coverage: ${c}/${repetition}`);
  }
  if (records.length !== 18) blockers.push('Expected exactly 18 results.');
  const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2; };
  const candidates = variants.slice(1).map(variant => {
    const pairs = records.filter((r: any) => r.variant === variant).map((r: any) => ({ candidate: r,
      baseline: records.find((b: any) => b.variant === 'baseline-high' && b.caseId === r.caseId && b.repetition === r.repetition) }));
    const rated = pairs.length > 0 && pairs.every(({ candidate, baseline }: any) => dimensions.every(d =>
      Number.isInteger(items.find((i: any) => i.id === candidate.blindId)?.scores?.[d])
      && Number.isInteger(items.find((i: any) => i.id === baseline?.blindId)?.scores?.[d])));
    const regression = rated ? pairs.some(({ candidate, baseline }: any) => dimensions.some(d =>
      items.find((i: any) => i.id === candidate.blindId).scores[d] < items.find((i: any) => i.id === baseline.blindId).scores[d])) : null;
    const reduction = pairs.length && pairs.every((p: any) => p.baseline?.elapsedMs > 0 && p.baseline.quiz && p.candidate.quiz && !p.baseline.error && !p.candidate.error)
      ? median(pairs.map((p: any) => 1 - p.candidate.elapsedMs / p.baseline.elapsedMs)) : null;
    return { variant, medianPairedReduction: reduction, measuredQualityRegression: regression,
      eligibleForControlledRollout: !blockers.length && regression === false && reduction !== null && reduction >= 0.4 };
  });
  return { blockers: [...new Set(blockers)], candidates, productionChanged: false,
    limitation: 'Small benchmark does not prove statistical equivalence. Requires independent human review and controlled rollout; this tool never changes production.' };
}

if (process.argv[1]?.endsWith('generation-quality-gate.ts')) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Provide comparison artifact directory.');
  const [data, review] = await Promise.all(['results.json', 'blind-review.json'].map(name => readFile(resolve(directory, name), 'utf8').then(JSON.parse)));
  const gate = evaluateGenerationGate(data, review);
  console.log(JSON.stringify(gate, null, 2));
  if (!gate.candidates.some(c => c.eligibleForControlledRollout)) process.exitCode = 1;
}

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DIFFICULTIES, DEFAULT_MODEL } from '../src/models.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { searchParallel } from '../src/server/parallelSearch.js';
import { generateQuizBatch } from '../src/server/geminiService.js';

// Manifest-only by default. Real provider calls require the explicit --live flag and caller-owned keys.
const args = process.argv.slice(2);
const value = (flag: string) => args.find(arg => arg.startsWith(flag + '='))?.slice(flag.length + 1);
const repetitions = Number(value('--repetitions') || 2);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3) throw new Error('Repetitions harus 1–3.');
const selected = value('--levels')?.split(',');
if (selected?.some(id => !DIFFICULTIES.some(d => d.id === id))) throw new Error('ID difficulty tidak valid.');
const levels = DIFFICULTIES.filter(d => !selected || selected.includes(d.id));
const cases = [
  { topic: 'Anatomi manusia: struktur, lokasi, dan hubungan antarstruktur' },
  { topic: 'Algoritma dan struktur data' },
  { topic: 'Sejarah Indonesia' },
];
const tasks = cases.flatMap(topic => levels.flatMap(level => Array.from({ length: repetitions }, (_, repetition) =>
  ['parallel', 'google', 'none'].map(mode => ({ caseId: crypto.randomUUID(), repetition, mode,
    config: normalizeQuizConfig({ ...topic, model: process.env.QUIZ_BENCHMARK_MODEL || DEFAULT_MODEL, difficulty: level.id,
      questionType: 'short_answer', questionCount: 3, language: 'id', timeLimitMinutes: 0, enableGrounding: mode !== 'none' }) }))).flat()));
const output = resolve('.qa', 'quality-benchmark');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ estimateOnly: true, tasks,
  rubric: ['relevance', 'reasoningDepth', 'difficultyFit', 'answerCorrectness', 'ambiguity', 'sourceSupport'],
  acceptance: 'Zero off-scope items for explicit scope; compare mean blinded ratings under identical topic/model/type/level. Participant mastery requires real response data.' }, null, 2));
console.log(`Manifest: ${tasks.length} attempts, up to ${tasks.length * 2} model calls and ${tasks.filter(t => t.mode === 'parallel').length} searches. Output: ${output}`);
if (args.includes('--live')) {
  const generatorKey = process.env.QUIZ_BENCHMARK_GEMINI_KEY;
  const searchKey = process.env.QUIZ_BENCHMARK_PARALLEL_KEY;
  if (!generatorKey || tasks.some(t => t.mode === 'parallel') && !searchKey) throw new Error('Set caller-owned benchmark keys before --live. No credentials are included in output.');
  const results: any[] = [], blind: any[] = [], mapping: any[] = [];
  for (const task of tasks) {
    const started = Date.now();
    try {
      const signal = AbortSignal.timeout(180000);
      const research = task.mode === 'parallel' ? await searchParallel(task.config.topic, searchKey!, signal, task.config) : undefined;
      const quiz = await generateQuizBatch(task.config, generatorKey!, [], signal, research);
      results.push({ ...task, status: 'accepted', durationMs: Date.now() - started, quiz });
      for (const question of quiz.questions) {
        const blindId = crypto.randomUUID();
        const { groundingSources, ...content } = question;
        blind.push({ blindId, topic: task.config.topic, difficulty: task.config.difficulty,
          question: content, humanRatings: { relevance: null, reasoningDepth: null, difficultyFit: null, answerCorrectness: null, ambiguity: null, comment: '' } });
        mapping.push({ blindId, caseId: task.caseId, mode: task.mode, sources: groundingSources });
      }
    } catch (error: any) {
      // Safe classified error only; never serialize raw provider errors, requests or credentials.
      results.push({ ...task, status: 'rejected', durationMs: Date.now() - started, code: typeof error?.code === 'string' ? error.code : 'BENCHMARK_FAILED' });
    }
    // Checkpoint completed cases. No automatic retry or hidden no-web substitution in the comparison.
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  }
  // Randomize review order so adjacent rows do not reveal provider order.
  for (let i = blind.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [blind[i], blind[j]] = [blind[j], blind[i]]; }
  await writeFile(resolve(output, 'blind-review.json'), JSON.stringify(blind, null, 2));
  await writeFile(resolve(output, 'review-mapping.json'), JSON.stringify(mapping, null, 2));
  console.log(`Completed: ${results.filter(r => r.status === 'accepted').length}/${tasks.length} accepted. Ratings require independent human review; acceptance is not proof of accuracy.`);
}

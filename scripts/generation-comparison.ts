import dotenv from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { QUESTION_TYPES } from '../src/types/quiz.js';
import { generateQuizBatch } from '../src/server/geminiService.js';
import { GENERATION_VARIANTS, generationRiskFactors } from '../src/server/generationStrategy.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const cases = [
  { id: 'newton-10', topic: 'Hukum Newton: gaya, massa, percepatan, dan penerapan sehari-hari', questionCount: 10, questionType: 'single_choice', difficulty: 'intermediate' },
  { id: 'mixed-7', topic: 'Pecahan dan bilangan rasional', questionCount: 7, difficulty: 'moderate',
    questionDistribution: Object.fromEntries(QUESTION_TYPES.map(type => [type, 1])),
    studyMaterial: 'Pecahan senilai mewakili nilai yang sama. Untuk menjumlahkan pecahan, samakan penyebut. Pembagian pecahan memakai perkalian dengan kebalikan pembagi.',
    additionalInstructions: 'Gunakan konteks sehari-hari dan jelaskan alasan matematis.' },
  { id: 'essay-2', topic: 'Analisis kompleksitas algoritma pencarian dan pengurutan', questionCount: 2, questionType: 'essay', difficulty: 'hard',
    additionalInstructions: 'Bedakan kondisi terbaik dan terburuk; sertakan rubrik yang menilai alasan.' },
].map(({ id, ...input }) => ({ id, config: normalizeQuizConfig({ ...input, model: 'gemini-3.8-flash', language: 'id', enableGrounding: false, timeLimitMinutes: 0 }) }));
const selected = args.find(arg => arg.startsWith('--case='))?.slice(7);
if (selected && !cases.some(c => c.id === selected)) throw new Error('Kasus benchmark tidak dikenal.');
const repetitions = Number(args.find(arg => arg.startsWith('--repetitions='))?.slice(14) ?? 1);
if (![1, 2].includes(repetitions)) throw new Error('Benchmark dibatasi satu atau dua pengulangan, tanpa retry.');
const manifest = { model: 'gemini-3.8-flash', transport: 'stream', timeoutMs: 145000, repetitions,
  cases: cases.filter(c => !selected || c.id === selected), variants: GENERATION_VARIANTS,
  minimumPromotionCoverage: 'All three cases, two repetitions per variant, independent human reviews; pilot cannot promote.' };
if (!args.includes('--live')) { console.log(JSON.stringify(manifest, null, 2)); } else {
  const key = process.env.QUIZ_BENCHMARK_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('MY_')) throw new Error('API key benchmark belum tersedia.');
  const directory = resolve('.qa/generation-performance', `comparison-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(directory, { recursive: true });
  const results: any[] = [];
  const checkpoint = async () => {
    await writeFile(resolve(directory, 'results.json'), JSON.stringify({ manifest, results }, null, 2));
    // No variant, token or latency labels in the independently reviewed artifact.
    await writeFile(resolve(directory, 'blind-review.json'), JSON.stringify({ reviewer: null, reviewedAt: null,
      instructions: 'Human review: score each dimension 0-4, list every critical error. Do not consult results.json until ratings are final.',
      items: results.filter(r => r.quiz).map(r => ({ id: r.blindId, config: r.config, quiz: r.quiz,
        scores: { factual: null, answerKey: null, explanation: null, ambiguity: null, difficulty: null, coverage: null }, criticalErrors: null }))
    }, null, 2));
  };
  console.log(`Benchmark serial; artifacts: ${directory}`);
  for (const [caseIndex, c] of manifest.cases.entries()) {
    let lastFailure = ''; let consecutive = 0; let failures = 0;
    for (let repetition = 0; repetition < repetitions; repetition++) {
      // Rotate order to reduce the effect of provider conditions and request position.
      const order = GENERATION_VARIANTS.map((_, index) => GENERATION_VARIANTS[(index + caseIndex + repetition) % GENERATION_VARIANTS.length]);
      for (const variant of order) {
        const started = Date.now();
        const record: any = { caseId: c.id, repetition, variant, config: c.config,
          configHash: createHash('sha256').update(JSON.stringify(c.config)).digest('hex'),
          risks: generationRiskFactors(c.config), blindId: randomUUID(), startedAt: new Date().toISOString() };
        console.log(`START ${c.id} ${repetition + 1} ${variant}; one request, no retry.`);
        try {
          const quiz = await generateQuizBatch(c.config, key, [], AbortSignal.timeout(manifest.timeoutMs), undefined, undefined,
            { stream: true, experiment: variant });
          record.metrics = quiz.generationMetrics;
          // Strip metadata that would reveal the variant to reviewers.
          const { generationMetrics, generationBatches, qualityReviews, ...reviewQuiz } = quiz;
          record.quiz = reviewQuiz;
          consecutive = 0; lastFailure = '';
        } catch (error: any) {
          record.error = { code: String(error.code || error.name || 'UNKNOWN'), status: error.status };
          if (error.diagnostics) record.diagnostics = error.diagnostics;
          failures++;
          consecutive = lastFailure === record.error.code ? consecutive + 1 : 1;
          lastFailure = record.error.code;
        }
        record.elapsedMs = Date.now() - started;
        results.push(record); await checkpoint();
        console.log(JSON.stringify({ caseId: c.id, variant, elapsedMs: record.elapsedMs, metrics: record.metrics, error: record.error }));
        if (consecutive >= 2 || failures >= 3) {
          await writeFile(resolve(directory, 'circuit-breaker.json'), JSON.stringify({ caseId: c.id, code: lastFailure,
            reason: 'Stop automatic calls. Inspect timing, finish status, schema or provider availability before another attempt.' }, null, 2));
          console.log('STOP: circuit breaker requires root cause analysis.');
          process.exitCode = 1;
          break;
        }
      }
      if (consecutive >= 2 || failures >= 3) break;
    }
    if (consecutive >= 2 || failures >= 3) break;
  }
  console.log('Production remains HIGH. Run generation-quality-gate.ts after independent human review.');
}

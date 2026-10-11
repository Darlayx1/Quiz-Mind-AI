import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateQuizBatch } from '../src/server/geminiService.js';
import { buildPrompt } from '../src/server/quizPipeline.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { DEFAULT_MODEL } from '../src/models.js';

dotenv.config({ quiet: true });
const args = process.argv.slice(2);
const label = args.find(arg => arg.startsWith('--label='))?.slice(8) || 'optimized';
if (!/^[a-z-]+$/.test(label)) throw new Error('Label benchmark tidak valid.');
const config = normalizeQuizConfig({ model: DEFAULT_MODEL, topic: 'Hukum Newton: gaya, massa, percepatan, dan penerapan sehari-hari',
  questionCount: 10, questionType: 'single_choice', difficulty: 'intermediate', timeLimitMinutes: 0,
  language: 'id', enableGrounding: false });
const prompt = buildPrompt(config, config.questionCount);
const manifest = { label, config, promptCharacters: prompt.systemInstruction.length + prompt.userPrompt.length,
  thinkingLevel: 'HIGH', modelCalls: 1, transport: args.includes('--stream') ? 'stream' : 'response', live: args.includes('--live') };
if (!args.includes('--live')) {
  console.log(JSON.stringify(manifest));
} else {
  const key = process.env.QUIZ_BENCHMARK_GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('MY_')) throw new Error('API key benchmark belum tersedia.');
  const directory = resolve('.qa/generation-performance');
  await mkdir(directory, { recursive: true });
  console.log(`LIVE ${label}: 10 soal, HIGH, tanpa web; satu permintaan, tanpa retry.`);
  const started = Date.now();
  try {
    const quiz = await generateQuizBatch(config, key, [], AbortSignal.timeout(145000), undefined, undefined,
      { stream: args.includes('--stream') });
    const result = { ...manifest, elapsedMs: Date.now() - started, metrics: quiz.generationMetrics, quiz };
    await writeFile(resolve(directory, label + '.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ label, elapsedMs: result.elapsedMs, questionCount: quiz.questions.length, metrics: result.metrics }));
  } catch (error: any) {
    const result = { ...manifest, elapsedMs: Date.now() - started, code: error.code || error.name, status: error.status };
    await writeFile(resolve(directory, label + '.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    process.exitCode = 1;
  }
}

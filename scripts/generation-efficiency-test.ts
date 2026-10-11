import assert from 'node:assert/strict';
import { DEFAULT_MODEL, DIFFICULTIES } from '../src/models.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { QUESTION_TYPES, type QuizConfig } from '../src/types/quiz.js';
import { buildPrompt, generateQuizBatch } from '../src/server/geminiService.js';
import { quizSchemaFor } from '../src/questionValidation.js';
import { fixtures } from './assessment-fixtures.js';
import { streamingFixtureFetch } from './stream-fixture.js';
import { GENERATION_VARIANTS, generationRiskFactors } from '../src/server/generationStrategy.js';

const base: QuizConfig = normalizeQuizConfig({ model: DEFAULT_MODEL, topic: 'Konsep', questionCount: 10,
  difficulty: 'intermediate', timeLimitMinutes: 0, language: 'id', enableGrounding: false,
  studyMaterial: 'Materi unik untuk mempertahankan cakupan.', additionalInstructions: 'Preferensi unik pengguna.' });
const originalFetch = globalThis.fetch;
let requests: any[] = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const body = await request.json();
  requests.push(body);
  const prompt = body.contents.flatMap((c: any) => c.parts.map((p: any) => p.text)).join('\n');
  const type = /Tipe: ([a-z_]+)/.exec(prompt)![1] as keyof typeof fixtures;
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({
    title: 'Konsep', summary: 'Latihan', questions: Array.from({ length: 10 }, (_, i) =>
      ({ ...fixtures[type], question: `${type} ${i}: Pertanyaan konsep yang berbeda?` }))
  }) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 900, thoughtsTokenCount: 450, totalTokenCount: 1450 } });
};
globalThis.fetch = streamingFixtureFetch(globalThis.fetch);
try {
  for (const type of QUESTION_TYPES) {
    requests = [];
    const config = normalizeQuizConfig({ ...base, questionType: type, questionDistribution: { [type]: 10 } });
    const prompt = buildPrompt(config, 10);
    assert.ok(!prompt.userPrompt.includes('Output JSON schema:'), 'Send structured schema only through the API');
    assert.equal((prompt.userPrompt.match(/Materi unik/g) || []).length, 1);
    assert.equal((prompt.userPrompt.match(/Preferensi unik/g) || []).length, 1);
    assert.ok(prompt.systemInstruction.includes(DIFFICULTIES.find(d => d.id === config.difficulty)!.description));
    for (const quality of ['factual correctness', 'unambiguous', 'rubrics are complete', 'solid reasoning'])
      assert.ok(prompt.systemInstruction.includes(quality), `Preserve quality criterion: ${quality}`);
    const progress: number[] = [];
    const quiz = await generateQuizBatch(config, 'fixture-key-never-display', [], undefined, undefined, undefined,
      { stream: true, onProgress: count => progress.push(count) });
    assert.equal(requests.length, 1, 'Exactly one provider request for all ten questions');
    const generation = requests[0].generationConfig;
    assert.equal(generation.thinkingConfig.thinkingLevel, 'HIGH');
    assert.deepEqual(generation.responseJsonSchema, { ...quizSchemaFor(type), properties: {
      ...quizSchemaFor(type).properties, questions: { ...quizSchemaFor(type).properties.questions, minItems: 10, maxItems: 10 }
    } });
    assert.equal(quiz.questions.length, 10);
    assert.deepEqual(progress, [10], 'Progress reflects complete question objects received in this chunk');
    assert.equal(quiz.generationMetrics![0].transport, 'stream');
    assert.ok(quiz.generationMetrics![0].firstTextMs! >= 0);
    assert.equal(quiz.generationMetrics![0].thinkingTokens, 450);
    assert.equal(quiz.generationMetrics![0].totalTokens, 1450);
    assert.equal(quiz.generationMetrics![0].thinkingLevel, 'HIGH');
    assert.ok(quiz.generationMetrics![0].providerDurationMs! >= 0);
    assert.ok(quiz.generationMetrics![0].validationDurationMs! >= 0);
  }
  for (const variant of GENERATION_VARIANTS) {
    requests = [];
    const config = normalizeQuizConfig({ ...base, questionType: 'single_choice', experiment: 'focused-medium' });
    assert.ok(!('experiment' in config), 'HTTP configuration cannot enable experimental reasoning');
    const quiz = await generateQuizBatch(config, 'fixture-key-never-display', [], undefined, undefined, undefined,
      { stream: true, experiment: variant });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].generationConfig.thinkingConfig.thinkingLevel, variant === 'focused-medium' ? 'MEDIUM' : 'HIGH');
    assert.equal(quiz.generationMetrics![0].strategy, variant);
    const prompt = buildPrompt(config, 10, [], variant !== 'baseline-high');
    for (const quality of ['factual correctness', 'unambiguous', 'rubrics are complete', 'solid reasoning'])
      assert.ok(prompt.systemInstruction.includes(quality));
    assert.equal((prompt.userPrompt.match(/Materi unik/g) || []).length, 1);
    assert.equal((prompt.userPrompt.match(/Preferensi unik/g) || []).length, 1);
    assert.equal(requests[0].generationConfig.responseJsonSchema.properties.questions.minItems, 10);
  }
  for (const model of ['gemma-4-31b-it', 'custom-model']) {
    requests = [];
    await assert.rejects(generateQuizBatch({ ...base, model }, 'fixture-key-never-display', [], undefined, undefined, undefined,
      { experiment: 'focused-medium' }), (error: any) => error.code === 'INVALID_EXPERIMENT');
    assert.equal(requests.length, 0, 'Unsupported experiments must fail before dispatch');
  }
  const successFetch = globalThis.fetch;
  requests = [];
  globalThis.fetch = streamingFixtureFetch(async (input, init) => {
    requests.push(await new Request(input, init).json());
    return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ text: '{' }] } }],
      usageMetadata: { thoughtsTokenCount: 8000, candidatesTokenCount: 2100, totalTokenCount: 10500 } });
  });
  await assert.rejects(generateQuizBatch(base, 'fixture-key-never-display', [], undefined, undefined, undefined, { stream: true }),
    (error: any) => error.code === 'INCOMPLETE_RESPONSE' && error.diagnostics.finishReason === 'MAX_TOKENS'
      && error.diagnostics.thinkingTokens === 8000 && error.diagnostics.maxOutputTokens === 10096);
  assert.equal(requests.length, 1, 'Output exhaustion is terminal, never a hidden retry');
  globalThis.fetch = successFetch;
  assert.ok(generationRiskFactors({ ...base, questionType: 'essay', questionDistribution: { essay: 10 }, difficulty: 'hard' }).includes('essay-rubric'));
  const mixed = buildPrompt(normalizeQuizConfig({ ...base, questionCount: 7,
    questionDistribution: Object.fromEntries(QUESTION_TYPES.map(t => [t, 1])) }), 7);
  assert.ok(!mixed.userPrompt.includes('Output JSON schema:'));
  for (const type of QUESTION_TYPES) assert.ok(mixed.userPrompt.includes(`${type}: 1 soal`));
  for (const model of ['gemma-4-31b-it', 'custom-model']) {
    const fallback = buildPrompt({ ...base, model }, 10);
    assert.ok(fallback.userPrompt.includes('Output JSON schema:'), 'Unstructured models still need the schema in the prompt');
  }
  console.log('PASS: 10 questions across all seven types, HIGH retained, no duplicate structured schema, exact counts, material/preferences preserved, fallback schemas and provider/thinking metrics. No external API calls.');
} finally { globalThis.fetch = originalFetch; }

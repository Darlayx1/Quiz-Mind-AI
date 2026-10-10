import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL } from '../src/models.js';
import { QUESTION_TYPES, type QuizConfig, type QuestionType } from '../src/types/quiz.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { quizSchemaFor } from '../src/questionValidation.js';
import { generateQuizBatch, classifyApiError, nextQuizBatch, isRetryableGenerationError } from '../src/server/geminiService.js';
import { localRepository } from '../src/workspace/localRepository.js';
import { generateWorkspaceQuiz } from '../src/workspace/ai.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { fixtures } from './assessment-fixtures.js';
import { build } from 'esbuild';

const base: QuizConfig = { model: DEFAULT_MODEL, topic: 'Konsep', questionCount: 1,
  difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false };
const key = 'fixture-secret-never-display';
const originalFetch = globalThis.fetch;
let requests: any[] = [];
let failure: 'network' | 'timeout' | 'cancel' | 'truncated' | 'blocked' | 'empty' | 'json' | 'count' | undefined;
const cancel = new AbortController();
const timeout = new AbortController();

for (const [status, code] of [[400, 'INVALID_ARGUMENT'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'],
  [404, 'MODEL_NOT_FOUND'], [429, 'RATE_LIMIT_EXCEEDED'], [500, 'PROVIDER_INTERNAL_ERROR'],
  [503, 'HIGH_DEMAND'], [504, 'TIMEOUT']] as const) {
  const error = classifyApiError(Object.assign(new Error('Provider rejected request: ' + key), { status }), DEFAULT_MODEL);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  assert.ok(!error.message.includes(key));
  assert.equal(isRetryableGenerationError(error), ![400, 404].includes(status));
}
for (const message of ['Failed to fetch', 'fetch failed', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
  assert.equal(classifyApiError(new TypeError(message), DEFAULT_MODEL).code, 'NETWORK_ERROR');
}
assert.equal(classifyApiError(new DOMException('Deadline exceeded', 'TimeoutError'), DEFAULT_MODEL).code, 'TIMEOUT');

const essayOnly = normalizeQuizConfig({ ...base, questionType: 'single_choice', questionCount: 2,
  questionDistribution: { essay: 2 } });
assert.equal(nextQuizBatch(essayOnly, []).questionType, 'essay', 'Missing distribution entries must mean zero');
assert.equal(nextQuizBatch({ ...base, questionType: 'true_false' }, []).questionType, 'true_false', 'Legacy configs without distribution remain supported');

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const body = await request.json();
  requests.push(body);
  if (failure === 'network') throw new TypeError('Failed to fetch');
  if (failure === 'timeout' || failure === 'cancel') {
    const controller = failure === 'timeout' ? timeout : cancel;
    controller.abort(new DOMException(failure === 'timeout' ? 'Deadline exceeded' : 'Cancelled', failure === 'timeout' ? 'TimeoutError' : 'AbortError'));
    throw controller.signal.reason;
  }
  const prompt = body.contents.map((c: any) => c.parts.map((p: any) => p.text ?? '').join('\n')).join('\n');
  const type = /Tipe: ([a-z_]+)/.exec(prompt)?.[1] as QuestionType;
  const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]);
  const output = { title: 'Fixture', summary: 'Latihan', questions: Array.from({ length: failure === 'count' ? 0 : count }, (_, i) =>
    ({ ...fixtures[type], question: `${type} ${requests.length} ${i}: Pertanyaan konsep?` })) };
  return Response.json({ candidates: [{ finishReason: failure === 'truncated' ? 'MAX_TOKENS' : failure === 'blocked' ? 'SAFETY' : 'STOP',
    content: { role: 'model', parts: failure === 'empty' ? [] : [{ text: failure === 'json' ? 'This is not JSON' : JSON.stringify(output) }] } }] });
};

try {
  for (const type of QUESTION_TYPES) {
    for (const grounded of [false, true]) {
      const quiz = await generateQuizBatch({ ...base, questionType: type, enableGrounding: grounded }, key);
      assert.equal(quiz.questions[0].type, type);
      const config = requests.at(-1).generationConfig;
      const schema = quizSchemaFor(type);
      assert.equal(config.responseMimeType, 'application/json');
      assert.deepEqual(config.responseJsonSchema, { ...schema, properties: { ...schema.properties,
        questions: { ...schema.properties.questions, minItems: 1, maxItems: 1 } } });
      assert.equal(config.maxOutputTokens, 8192);
      assert.equal(Boolean(requests.at(-1).tools?.length), grounded);
    }
  }
  await generateQuizBatch({ ...base, model: 'gemma-4-31b-it' }, key);
  assert.equal(requests.at(-1).generationConfig.responseJsonSchema, undefined);
  assert.equal(requests.at(-1).systemInstruction, undefined);
  assert.equal(requests.at(-1).tools, undefined);
  await generateQuizBatch({ ...base, provider: 'gemini', model: 'custom-model' }, key);
  assert.equal(requests.at(-1).generationConfig.responseJsonSchema, undefined);

  failure = 'network';
  await assert.rejects(generateQuizBatch(base, key), (e: any) => e.code === 'NETWORK_ERROR');
  failure = 'timeout';
  await assert.rejects(generateQuizBatch(base, key, [], timeout.signal), (e: any) => e.code === 'TIMEOUT');
  failure = 'cancel';
  await assert.rejects(generateQuizBatch(base, key, [], cancel.signal), (e: any) => e.name === 'AbortError');

  await localRepository.load();
  await localRepository.putKey({ label: 'Fixture', secret: key });
  const preferences = { ...emptyWorkspace().preferences, grounding: false };
  for (const [mode, expectedCode] of [['truncated', 'INCOMPLETE_RESPONSE'], ['blocked', 'RESPONSE_BLOCKED'],
    ['empty', 'EMPTY_RESPONSE'], ['json', 'INVALID_JSON'], ['count', 'INCOMPLETE_QUESTION_COUNT']] as const) {
    failure = mode;
    const before = requests.length;
    await assert.rejects(generateWorkspaceQuiz(base, preferences, await localRepository.keys(), localRepository,
      async () => {}, new AbortController().signal), (e: any) => e.code === expectedCode);
    assert.equal(requests.length - before, 1, 'Do not repeat an invalid/blocked response with identical input');
  }
  failure = undefined;
  const quiz = await generateWorkspaceQuiz(essayOnly, preferences, await localRepository.keys(), localRepository,
    async () => {}, new AbortController().signal);
  assert.deepEqual(quiz.questions.map(q => q.type), ['essay', 'essay']);
  assert.equal(quiz.questions.length, 2);
  console.log('PASS: active generator schemas for all seven types with/without search, Gemma/custom compatibility, sparse distributions, HTTP/network diagnostics, timeout/cancel, and no repeated invalid output. No external API requests.');
} finally {
  globalThis.fetch = originalFetch;
}

// Exercise the authenticated Edge handler with isolated account/provider fixtures.
const runtime = globalThis as any;
const priorDeno = runtime.Deno;
let handler: (request: Request) => Promise<Response>;
let accountCalls = 0;
let accountFailure = false;
const outcomes: string[] = [];
const commits: any[] = [];
const preferences = { ...emptyWorkspace().preferences, grounding: false };
const operationId = crypto.randomUUID();
const admin = {
  auth: { getUser: async () => ({ data: { user: { id: 'account-fixture' } }, error: null }) },
  from: () => {
    const query: any = { select: () => query, eq: () => query, order: () => query,
      then: (resolve: any) => Promise.resolve({ data: [{ id: 'account-key', enabled: true }], error: null }).then(resolve) };
    return query;
  },
  rpc: async (name: string, params: any) => {
    if (name === 'qm_claim_job') return { data: { id: operationId, status: 'pending', lease_token: 'fixture-lease' }, error: null };
    if (name === 'qm_service_credential') return { data: key, error: null };
    if (name === 'qm_record_outcome') outcomes.push(params.p_status);
    if (name === 'qm_commit_job') commits.push(params);
    return { data: null, error: null };
  },
};
runtime.__accountGenerationAdmin = admin;
runtime.__accountGenerationCall = async (params: any) => {
  accountCalls++;
  assert.equal(params.config.responseMimeType, 'application/json');
  assert.deepEqual(params.config.responseJsonSchema.properties.questions.items, quizSchemaFor('essay').properties.questions.items);
  const text = JSON.stringify({ title: 'Esai akun', questions: Array.from({ length: 2 }, (_, i) =>
    ({ ...fixtures.essay, question: `Esai akun ${i}: Jelaskan konsep tersebut?` })) });
  return { text, candidates: [{ finishReason: accountFailure ? 'MAX_TOKENS' : 'STOP' }] };
};
runtime.Deno = { env: { get: () => 'https://account-fixture.invalid' }, serve: (fn: typeof handler) => { handler = fn; } };
try {
  const compiled = await build({ entryPoints: ['supabase/functions/quiz-ai/index.ts'], bundle: true, write: false,
    format: 'esm', platform: 'node', plugins: [{ name: 'isolated-account-fixtures', setup(plugin) {
      plugin.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'supabase', namespace: 'fixtures' }));
      plugin.onResolve({ filter: /^npm:@google\/genai/ }, () => ({ path: 'genai', namespace: 'fixtures' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixtures' }, args => ({ contents: args.path === 'supabase'
        ? 'export const createClient = () => globalThis.__accountGenerationAdmin;'
        : 'export class GoogleGenAI { constructor() { this.models = { generateContent: params => globalThis.__accountGenerationCall(params) }; } }' }));
    } }] });
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const request = () => new Request('https://account-fixture.invalid/functions/v1/quiz-ai', { method: 'POST',
    headers: { Authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', operationId, config: essayOnly, preferences }) });
  let response = await handler!(request());
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.deepEqual((await response.json()).quiz.questions.map((q: any) => q.type), ['essay', 'essay']);
  assert.equal(accountCalls, 1);
  assert.equal(commits.at(-1).p_status, 'completed');
  accountFailure = true;
  response = await handler!(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /terpotong/);
  assert.equal(accountCalls, 2, 'Account must not retry identical truncated output');
  assert.equal(outcomes.at(-1), 'unavailable');
  assert.equal(commits.at(-1).p_status, 'pending');
  console.log('PASS: authenticated account handler, generated Edge engine, sparse essay distribution, correct schema, and checkpoint preserved after truncated response. No external API requests.');
} finally {
  runtime.Deno = priorDeno;
  delete runtime.__accountGenerationAdmin;
  delete runtime.__accountGenerationCall;
}

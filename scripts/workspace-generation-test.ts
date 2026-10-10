import { qualityReviewFixture } from './quality-review-fixture.js';
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
let failure: 'network' | 'timeout' | 'cancel' | 'truncated' | 'blocked' | 'empty' | 'json' | 'count' | 'search-quota' | 'all-quota' | 'no-web-sources' | 'no-web-query' | undefined;
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
  if (failure) requests.push(body);
  if (failure === 'all-quota' || failure === 'search-quota' && body.tools?.length) return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota limited' } }, { status: 429 });
  if (failure === 'network') throw new TypeError('Failed to fetch');
  if (failure === 'timeout' || failure === 'cancel') {
    const controller = failure === 'timeout' ? timeout : cancel;
    controller.abort(new DOMException(failure === 'timeout' ? 'Deadline exceeded' : 'Cancelled', failure === 'timeout' ? 'TimeoutError' : 'AbortError'));
    throw controller.signal.reason;
  }
  const prompt = body.contents.map((c: any) => c.parts.map((p: any) => p.text ?? '').join('\n')).join('\n');
  const audit = qualityReviewFixture(prompt);
  if (audit) return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(audit) }] } }] });
  if (!failure) requests.push(body);
  const type = /Tipe: ([a-z_]+)/.exec(prompt)?.[1] as QuestionType;
  const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]);
  const output = { title: 'Fixture', summary: 'Latihan', questions: Array.from({ length: failure === 'count' ? 0 : count }, (_, i) =>
    ({ ...fixtures[type], question: `${type} ${requests.length} ${i}: Pertanyaan konsep?` })) };
  return Response.json({ candidates: [{ finishReason: failure === 'truncated' ? 'MAX_TOKENS' : failure === 'blocked' ? 'SAFETY' : 'STOP',
    ...(body.tools?.length ? { groundingMetadata: { webSearchQueries: failure === 'no-web-query' ? [] : ['official concept'], groundingChunks: failure === 'no-web-sources' ? [] : [{ web: { title: 'Official fixture source', uri: 'https://example.org/reference' } }] } } : {}),
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
      assert.equal(quiz.usedGrounding, grounded);
      assert.equal(Boolean(quiz.webCheckedAt), grounded);
      if (grounded) assert.ok(quiz.questions.every(q => q.groundingSources.some(s => s.url === 'https://example.org/reference')));
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
  failure = 'search-quota';
  const start = requests.length;
  await assert.rejects(generateWorkspaceQuiz({ ...base, questionCount: 6 }, { ...preferences, grounding: true, allowGroundingFallback: true },
    await localRepository.keys(), localRepository, async () => {}, new AbortController().signal), (e: any) => e.code === 'WEB_SEARCH_QUOTA');
  assert.deepEqual(requests.slice(start).map(r => Boolean(r.tools?.length)), [true], 'Legacy fallback preference must never bypass required web');
  const disabledStart = requests.length;
  await assert.rejects(generateWorkspaceQuiz(base, { ...preferences, grounding: true, allowGroundingFallback: false }, await localRepository.keys(), localRepository, async () => {}, new AbortController().signal), (e: any) => e.status === 429);
  assert.equal(requests.length - disabledStart, 1);
  failure = 'all-quota';
  const allQuotaStart = requests.length;
  await assert.rejects(generateWorkspaceQuiz(base, { ...preferences, grounding: true }, await localRepository.keys(), localRepository, async () => {}, new AbortController().signal), (e: any) => e.status === 429);
  assert.equal(requests.length - allQuotaStart, 1, 'Required web quota rejection stops without identical retries');
  for (const mode of ['no-web-sources', 'no-web-query'] as const) {
    failure = mode;
    const before = requests.length;
    const quiz = await generateWorkspaceQuiz(base, { ...preferences, grounding: true }, await localRepository.keys(), localRepository, async () => {}, new AbortController().signal);
    assert.equal(quiz.questions.length, 1); assert.ok(quiz.generationWarnings!.length);
    assert.equal(requests.length - before, 1, 'One generation, without regenerating');
  }
  failure = undefined;
  const groundedQuiz = await generateWorkspaceQuiz({ ...base, questionCount: 6 }, { ...preferences, grounding: true }, await localRepository.keys(), localRepository, async () => {}, new AbortController().signal);
  assert.equal(groundedQuiz.questions.length, 6);
  assert.ok(groundedQuiz.usedGrounding && groundedQuiz.webCheckedAt);
  assert.ok(groundedQuiz.questions.every(q => q.groundingSources.length));
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
let accountSearchQuota = false;
let accountNoSources = false;
const outcomes: string[] = [];
const commits: any[] = [];
const preferences = { ...emptyWorkspace().preferences, grounding: false };
const operationId = crypto.randomUUID();
let cancelledInDatabase = false;
const admin = {
  auth: { getUser: async () => ({ data: { user: { id: 'account-fixture' } }, error: null }) },
  from: (table: string) => {
    if (table === 'qm_ai_jobs') {
      const query: any = { select: () => query, eq: () => query,
        single: async () => ({ data: { status: cancelledInDatabase ? 'cancelled' : 'running', lease_token: 'fixture-lease' }, error: null }) };
      return query;
    }
    const query: any = { select: () => query, eq: () => query, order: () => query,
      then: (resolve: any) => Promise.resolve({ data: [{ id: 'account-key', enabled: true }], error: null }).then(resolve) };
    return query;
  },
  rpc: async (name: string, params: any) => {
    if (name === 'qm_claim_job') return { data: { id: params.p_id || operationId, status: 'pending', lease_token: 'fixture-lease' }, error: null };
    if (name === 'qm_service_credential') return { data: key, error: null };
    if (name === 'qm_record_outcome') outcomes.push(params.p_status);
    if (name === 'qm_commit_job') commits.push(params);
    if (name === 'qm_reserve_dispatch') return { data: true, error: null };
    return { data: null, error: null };
  },
};
runtime.__accountGenerationAdmin = admin;
runtime.__accountGenerationCall = async (params: any) => {
  const audit = qualityReviewFixture(params.contents);
  if (audit) return { text: JSON.stringify(audit), candidates: [{ finishReason: 'STOP' }] };
  accountCalls++;
  if (accountSearchQuota && params.config.tools?.length) throw Object.assign(new Error('Quota limited'), { status: 429 });
  assert.equal(params.config.responseMimeType, 'application/json');
  assert.deepEqual(params.config.responseJsonSchema.properties.questions.items, quizSchemaFor('essay').properties.questions.items);
  const text = JSON.stringify({ title: 'Esai akun', questions: Array.from({ length: 2 }, (_, i) =>
    ({ ...fixtures.essay, question: `Esai akun ${i}: Jelaskan konsep tersebut?` })) });
  return { text, candidates: [{ finishReason: accountFailure ? 'MAX_TOKENS' : 'STOP',
    ...(params.config.tools?.length ? { groundingMetadata: { webSearchQueries: ['official concepts'], groundingChunks: accountNoSources ? [] : [{ web: { title: 'Official fixture', uri: 'https://example.org/account-reference' } }] } } : {}) }] };
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
  const request = (prefs = preferences) => new Request('https://account-fixture.invalid/functions/v1/quiz-ai', { method: 'POST',
    headers: { Authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', operationId: crypto.randomUUID(), config: essayOnly, preferences: prefs }) });
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
  assert.equal(commits.at(-1).p_status, 'failed_after_dispatch');
  accountFailure = false; accountSearchQuota = true;
  response = await handler!(request({ ...preferences, grounding: true }));
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'WEB_SEARCH_QUOTA');
  assert.equal(accountCalls, 3, 'Account must never fall back without web');
  accountSearchQuota = false; accountNoSources = true;
  response = await handler!(request({ ...preferences, grounding: true }));
  assert.equal(response.status, 200);
  const withoutSources = (await response.json()).quiz;
  assert.equal(withoutSources.usedGrounding, false); assert.ok(withoutSources.generationWarnings.length);
  accountNoSources = false;
  response = await handler!(request({ ...preferences, grounding: true }));
  assert.equal(response.status, 200);
  const grounded = (await response.json()).quiz;
  assert.ok(grounded.usedGrounding && grounded.webCheckedAt);
  assert.ok(grounded.questions.every((q: any) => q.groundingSources.length));
  let providerSignal: AbortSignal | undefined;
  let providerStarted!: () => void;
  const providerCalled = new Promise<void>(resolve => { providerStarted = resolve; });
  runtime.__accountGenerationCall = (params: any) => new Promise((_resolve, reject) => {
    providerSignal = params.config.abortSignal;
    providerSignal!.addEventListener('abort', () => reject(providerSignal!.reason), { once: true });
    providerStarted();
  });
  const controller = new AbortController();
  const cancellable = new Request('https://account-fixture.invalid/functions/v1/quiz-ai', { method: 'POST', signal: controller.signal,
    headers: { Authorization: 'Bearer fixture-only', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', operationId, config: essayOnly, preferences }) });
  const interrupted = handler!(cancellable);
  await providerCalled;
  const commitsBeforeCancel = commits.length;
  controller.abort();
  await interrupted;
  assert.equal(providerSignal?.aborted, true, 'Client cancellation must abort the Edge Gemini call');
  assert.ok(commits.slice(commitsBeforeCancel).every(commit => commit.p_status !== 'completed'));
  let secondProviderStarted!: () => void;
  const secondProviderCalled = new Promise<void>(resolve => { secondProviderStarted = resolve; });
  runtime.__accountGenerationCall = (params: any) => new Promise((_resolve, reject) => {
    providerSignal = params.config.abortSignal;
    providerSignal!.addEventListener('abort', () => reject(providerSignal!.reason), { once: true });
    secondProviderStarted();
  });
  const dbInterrupted = handler!(request());
  await secondProviderCalled;
  cancelledInDatabase = true;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([dbInterrupted, new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('Database cancellation did not reach Gemini.')), 5000);
    })]);
  } finally { if (watchdog) clearTimeout(watchdog); }
  assert.equal(providerSignal?.aborted, true, 'Database cancellation must abort the Edge Gemini call');
  console.log('PASS: account generation, client and database cancellation reach the Edge Gemini call. No external API requests.');
} finally {
  runtime.Deno = priorDeno;
  delete runtime.__accountGenerationAdmin;
  delete runtime.__accountGenerationCall;
}

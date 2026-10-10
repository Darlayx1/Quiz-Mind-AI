import { qualityReviewFixture } from './quality-review-fixture.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fixtures } from './assessment-fixtures.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { DEFAULT_MODEL } from '../src/models.js';

await test('Parallel authenticated Edge pipeline (isolated fixtures)', async t => {
  const runtime = globalThis as any;
  const originalDeno = runtime.Deno; const originalFetch = globalThis.fetch;
  let handler: (request: Request) => Promise<Response>;
  const id = crypto.randomUUID(); const lease = crypto.randomUUID(); const owner = crypto.randomUUID();
  const sourceUrl = 'https://example.org/account-evidence';
  let searches = 0; let generations = 0; let failure = false; let searchStatus = 200; let enabled = true; let saved: any;
  let rejectAudit = false; let emptySearch = false; let partial = false;
  const writes: any[] = []; const credentials: string[] = [];
  const config = { topic: 'Concept', model: DEFAULT_MODEL, questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: true };
  const preferences = { ...emptyWorkspace().preferences, searchProvider: 'parallel' };
  runtime.__parallelAdmin = {
    auth: { getUser: async (token: string) => token === 'fixture-token' ? { data: { user: { id: owner } } } : { data: {}, error: true } },
    from: () => {
      const query: any = { select: () => query, eq: () => query, order: () => query,
        then: (resolve: any) => Promise.resolve({ data: [{ id: 'parallel-id', provider: 'parallel', enabled }, { id: 'gemini-id', provider: 'gemini', enabled: true }].filter(k => k.enabled) }).then(resolve),
        single: async () => ({ data: { status: 'running', lease_token: lease } }) };
      return query;
    },
    rpc: async (name: string, args: any) => {
      assert.equal(args.p_user, owner, 'Every service call pins authenticated ownership'); writes.push({ name, args });
      if (name === 'qm_service_credential') { credentials.push(args.p_key); return { data: args.p_key === 'parallel-id' ? 'fixture-parallel-account' : 'fixture-google-account' }; }
      if (name === 'qm_claim_job') return { data: { id, status: 'pending', lease_token: lease, result: saved } };
      if (name === 'qm_checkpoint_research') saved = { ...(saved || {}), questions: [], parallelResearch: args.p_research };
      if (name === 'qm_checkpoint_generation_state') saved = { ...(saved || {}), generationState: structuredClone(args.p_state) };
      if (name === 'qm_commit_job') saved = args.p_result;
      return { data: null };
    },
  };
  runtime.__parallelModelCall = async (params: any, key: string) => {
    const audit = qualityReviewFixture(params.contents);
    if (audit) {
      if (rejectAudit) { audit.reviews[0].correct = false; audit.reviews[0].reason = 'Kunci tidak sesuai konsep.'; }
      return { text: JSON.stringify(audit), candidates: [{ finishReason: 'STOP' }] };
    }
    generations++; assert.equal(key, 'fixture-google-account'); assert.ok(!params.config.tools?.length);
    if (!emptySearch) assert.ok(params.contents.includes(sourceUrl));
    assert.ok(writes.some(w => w.name === 'qm_checkpoint_generation_state'), 'Attempt budget persisted before generation');
    const count = Number(/Jumlah Soal: (\d+)/.exec(params.contents)?.[1]);
    return { text: JSON.stringify({ title: 'Account quiz', questions: Array.from({ length: partial ? 1 : count }, (_, i) => ({ ...fixtures.single_choice, question: 'Question ' + generations + '-' + i, sourceUrls: [sourceUrl] })) }), candidates: [{ finishReason: failure ? 'MAX_TOKENS' : 'STOP' }] };
  };
  runtime.Deno = { env: { get: () => 'https://fixture.invalid' }, serve: (fn: typeof handler) => { handler = fn; } };
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://api.parallel.ai/v1/search'); assert.equal(new Headers(init?.headers).get('x-api-key'), 'fixture-parallel-account'); searches++;
    return Response.json({ results: emptySearch ? [] : [{ title: 'Primary', url: sourceUrl, excerpts: ['Concept evidence.'] }] }, { status: searchStatus });
  };
  try {
    const compiled = await build({ entryPoints: ['supabase/functions/quiz-ai/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
      plugins: [{ name: 'parallel-account-fixtures', setup(plugin) {
        plugin.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        plugin.onResolve({ filter: /^npm:@google\/genai/ }, () => ({ path: 'google', namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'supabase'
          ? 'export const createClient = () => globalThis.__parallelAdmin;'
          : 'export class GoogleGenAI { constructor({apiKey}) { this.models = {generateContent: params => globalThis.__parallelModelCall(params,apiKey)}; } }' }));
      } }] });
    await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
    const request = (body: any = {}, token = 'fixture-token') => new Request('https://fixture.invalid/quiz-ai', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', operationId: id, config, preferences, ...body }) });
    await t.test('authentication is required before any credential access', async () => {
      assert.equal((await handler(request({}, 'invalid-token'))).status, 401); assert.equal(credentials.length, 0);
      assert.equal((await handler(new Request('https://fixture.invalid/quiz-ai', { method: 'POST' }))).status, 401);
    });
    await t.test('search failure records Parallel outcome; no model or Google fallback', async () => {
      searchStatus = 402;
      const response = await handler(request()); assert.equal(response.status, 402); assert.equal(generations, 0);
      assert.equal(writes.filter(w => w.name === 'qm_record_outcome').at(-1).args.p_key, 'parallel-id'); searchStatus = 200;
    });
    await t.test('failed model batch retains research for a subsequent resume', async () => {
      failure = true; const beforeSearch = searches;
      assert.equal((await handler(request())).status, 502); assert.equal(searches - beforeSearch, 1); assert.ok(saved.parallelResearch);
      failure = false;
      const response = await handler(request()); assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const quiz = (await response.json()).quiz;
      assert.equal(quiz.searchProvider, 'parallel'); assert.equal(quiz.questions[0].groundingSources[0].url, sourceUrl);
      assert.equal(searches - beforeSearch, 1, 'Resume must not repeat a successful search');
    });
    await t.test('account negative audit returns the quiz without retrying', async () => {
      const previous = saved; saved = undefined; rejectAudit = true; const before = generations;
      const response = await handler(request()); assert.equal(response.status, 200);
      const quiz = (await response.json()).quiz;
      assert.equal(quiz.questions.length, 1); assert.ok(quiz.generationWarnings.length);
      assert.equal(generations - before, 1); assert.equal(saved.generationState.attemptState, undefined);
      rejectAudit = false; saved = previous;
    });
    await t.test('account partial batch commits usable items and fills the remaining count on resume', async () => {
      const previous = saved; saved = undefined; partial = true;
      const body = { config: { ...config, questionCount: 3 } };
      const first = await handler(request(body)); assert.equal(first.status, 200);
      const initial = await first.json(); assert.equal(initial.quiz.questions.length, 1); assert.equal(initial.complete, false);
      partial = false;
      const second = await handler(request(body)); assert.equal(second.status, 200);
      const resumed = await second.json(); assert.equal(resumed.quiz.questions.length, 3); assert.equal(resumed.complete, true);
      assert.equal(resumed.quiz.questions[0].id, initial.quiz.questions[0].id); saved = previous;
    });
    await t.test('account resume recovers obsolete quality circuits', async () => {
      const previous = saved; saved = { questions: [], generationState: { attemptState: { batchOffset: 0, calls: 3, repeated: 2, lastCode: 'QUALITY_REJECTED' } } };
      const response = await handler(request()); assert.equal(response.status, 200); assert.equal((await response.json()).quiz.questions.length, 1); saved = previous;
    });
    await t.test('account empty-source fallback is disclosed for all topics', async () => {
      const previous = saved; saved = undefined; emptySearch = true;
      const response = await handler(request()); assert.equal(response.status, 200);
      const quiz = (await response.json()).quiz;
      assert.equal(quiz.usedGrounding, false); assert.equal(quiz.groundingFallbackUsed, true); assert.ok(quiz.generationWarnings.length);
      assert.equal(quiz.generationState.parallelFallback, 'PARALLEL_SEARCH_EMPTY');
      saved = undefined; const before = generations;
      const current = await handler(request({ config: { ...config, topic: 'Pedoman terapi terbaru' } }));
      assert.equal(current.status, 200); const currentQuiz = (await current.json()).quiz; assert.equal(currentQuiz.usedGrounding, false); assert.ok(currentQuiz.generationWarnings.some((w: string) => w.includes('belum diverifikasi'))); assert.equal(generations, before + 1);
      emptySearch = false; saved = previous;
    });
    await t.test('manual Parallel key test searches without calling Gemini', async () => {
      const before = generations; const beforeSearch = searches;
      assert.equal((await handler(request({ action: 'test', keyId: 'parallel-id', model: DEFAULT_MODEL }))).status, 200);
      assert.equal(generations, before); assert.equal(searches - beforeSearch, 1);
    });
    await t.test('Parallel key cannot be used as evaluator or selected Gemini key', async () => {
      const before = generations;
      assert.equal((await handler(request({ action: 'evaluate', keyId: 'parallel-id' }))).status, 404);
      assert.equal((await handler(request({ preferences: { ...preferences, keyId: 'parallel-id' } }))).status, 400);
      assert.equal(generations, before);
    });
    await t.test('disabled Parallel key blocks use even when research was saved', async () => {
      enabled = false; saved = { questions: [], parallelResearch: saved.parallelResearch }; const before = generations;
      const response = await handler(request());
      assert.equal(response.status, 400); assert.equal((await response.json()).code, 'PARALLEL_KEY_MISSING'); assert.equal(generations, before); enabled = true;
    });
    await t.test('client cancellation aborts Parallel search before model generation', async () => {
      saved = undefined; const before = generations; const controller = new AbortController();
      let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
      globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); started();
      });
      const call = handler(new Request(request(), { signal: controller.signal })); await ready; controller.abort();
      assert.equal((await call).status, 409); assert.equal(generations, before);
    });
    await t.test('static-hosting guest Edge relay handles CORS without account or database access', async () => {
      let guestHandler: (request: Request) => Promise<Response>;
      runtime.Deno.serve = (fn: typeof guestHandler) => { guestHandler = fn; };
      const compiledGuest = await build({ entryPoints: ['supabase/functions/parallel-search/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
      await import('data:text/javascript;base64,' + Buffer.from(compiledGuest.outputFiles[0].text).toString('base64'));
      let calls = 0; const databaseCalls = writes.length;
      globalThis.fetch = async (_input, init) => { calls++; assert.equal(new Headers(init?.headers).get('x-api-key'), 'fixture-guest-key');
        return Response.json({ results: [{ url: sourceUrl, title: 'Primary', excerpts: ['Guest evidence'] }] }); };
      const url = 'https://fixture.invalid/functions/v1/parallel-search';
      const preflight = await guestHandler!(new Request(url, { method: 'OPTIONS' }));
      assert.equal(preflight.status, 200); assert.ok(preflight.headers.get('access-control-allow-headers')?.includes('apikey')); assert.equal(calls, 0);
      const response = await guestHandler!(new Request(url, { method: 'POST', body: JSON.stringify({ topic: 'Concept', secret: 'fixture-guest-key' }) }));
      assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.equal((await response.json()).research.sources[0].url, sourceUrl); assert.equal(calls, 1); assert.equal(writes.length, databaseCalls);
    });
  } finally {
    runtime.Deno = originalDeno; globalThis.fetch = originalFetch; delete runtime.__parallelAdmin; delete runtime.__parallelModelCall;
  }
});

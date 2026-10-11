import { qualityReviewFixture } from './quality-review-fixture.js';
import { streamingFixtureFetch } from './stream-fixture.js';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assessmentScopeKey } from '../src/server/assessmentPolicy.js';
import { searchParallel, parallelRelay, usableResearch } from '../src/server/parallelSearch.js';
import { localRepository, localCredential, localImportPayload } from '../src/workspace/localRepository.js';
import { availableKeys, emptyWorkspace, type GenerationJob } from '../src/workspace/types.js';
import { generateWorkspaceQuiz, testKey } from '../src/workspace/ai.js';
import { generateQuizBatch } from '../src/server/geminiService.js';
import { AISettings } from '../src/components/AISettings.js';
import { fixtures } from './assessment-fixtures.js';
import { DEFAULT_MODEL } from '../src/models.js';
import type { QuizConfig } from '../src/types/quiz.js';

const secret = 'fixture-parallel-secret';
const sourceUrl = 'https://example.org/evidence';
const results = [{ title: 'Primary source', url: sourceUrl, excerpts: ['A trustworthy concept.'] }];
const base: QuizConfig = { topic: 'Konsep', model: DEFAULT_MODEL, questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: true };

await test('Parallel search integration (no external calls)', async t => {
  const originalFetch = globalThis.fetch;
  try {
    await t.test('bounded request, custom key header, normalized and deduplicated evidence', async () => {
      globalThis.fetch = async (input, init) => {
        assert.equal(input, 'https://api.parallel.ai/v1/search');
        assert.equal(new Headers(init?.headers).get('x-api-key'), secret);
        assert.equal(init?.signal?.aborted, false);
        const request = JSON.parse(String(init?.body)); assert.equal(request.mode, 'fast'); assert.equal(request.advanced_settings.max_results, 5);
        return Response.json({ results: [...results, ...results, { url: 'javascript:alert(1)', excerpts: ['unsafe'] }, { url: 'https://empty.example', excerpts: [] }] });
      };
      const research = await searchParallel(base.topic, secret);
      assert.equal(research.sources.length, 1); assert.ok(usableResearch(research, base.topic)); assert.ok(!usableResearch(research, 'Other topic'));
    });
    await t.test('HTTP failures stop after one call and never expose a provider error or key', async () => {
      for (const status of [401, 402, 403, 429, 500]) {
        let calls = 0;
        globalThis.fetch = async () => { calls++; return Response.json({ error: secret }, { status }); };
        await assert.rejects(searchParallel(base.topic, secret), (e: any) => e.status === status && !e.message.includes(secret));
        assert.equal(calls, 1);
      }
    });
    await t.test('empty/invalid results, cancellation and timeout produce bounded failures', async () => {
      globalThis.fetch = async () => Response.json({ results: [] });
      await assert.rejects(searchParallel(base.topic, secret), (e: any) => e.code === 'PARALLEL_SEARCH_EMPTY');
      globalThis.fetch = async () => { throw new TypeError(secret); };
      await assert.rejects(searchParallel(base.topic, secret), (e: any) => !e.message.includes(secret));
      const controller = new AbortController(); controller.abort();
      await assert.rejects(searchParallel(base.topic, secret, controller.signal), (e: any) => e.name === 'AbortError');
      const timeout = AbortSignal.timeout;
      AbortSignal.timeout = () => { const c = new AbortController(); c.abort(new DOMException('Timeout', 'TimeoutError')); return c.signal; };
      try { await assert.rejects(searchParallel(base.topic, secret), (e: any) => e.code === 'PARALLEL_TIMEOUT'); }
      finally { AbortSignal.timeout = timeout; }
    });
    await t.test('guest relay validates body size, method and key; only forwards to the fixed API', async () => {
      globalThis.fetch = async () => Response.json({ results });
      const relay = (body: string) => parallelRelay(new Request('https://app.example/api/parallel-search', { method: 'POST', body }));
      const success = await relay(JSON.stringify({ topic: base.topic, secret }));
      assert.equal(success.status, 200); assert.equal(success.headers.get('cache-control'), 'no-store');
      assert.ok(!JSON.stringify(await success.json()).includes(secret));
      assert.equal((await relay('{')).status, 400);
      assert.equal((await relay('x'.repeat(131073))).status, 413);
      assert.equal((await relay(JSON.stringify({ topic: base.topic, secret: 'bad' }))).status, 400);
      assert.equal((await parallelRelay(new Request('https://app.example/api/parallel-search'))).status, 405);
    });
    await localRepository.load();
    await t.test('concurrent saves permit one Parallel slot, even when disabled, and hide secrets', async () => {
      const saved = await Promise.allSettled([
        localRepository.putKey({ provider: 'parallel', label: 'Parallel', secret }),
        localRepository.putKey({ provider: 'parallel', label: 'Parallel 2', secret: 'fixture-second-parallel' }),
      ]);
      assert.equal(saved.filter(s => s.status === 'fulfilled').length, 1);
      const key = (await localRepository.keys())[0]; assert.equal(key.provider, 'parallel'); assert.ok(!JSON.stringify(key).includes(secret));
      assert.equal(await localCredential(key.id), saved[0].status === 'fulfilled' ? secret : 'fixture-second-parallel');
      await localRepository.putKey({ id: key.id, label: key.label, enabled: false });
      await assert.rejects(localRepository.putKey({ provider: 'parallel', label: 'Second', secret: 'fixture-second-key' }), /Maksimal 1/);
      await assert.rejects(localRepository.putKey({ id: key.id, provider: 'gemini', label: key.label }), /Penyedia/);
      await localRepository.putKey({ id: key.id, label: key.label, secret: 'fixture-replaced-parallel', enabled: true });
      assert.equal(await localCredential(key.id), 'fixture-replaced-parallel');
      assert.equal((await localRepository.keys())[0].status, 'untested');
    });
    await localRepository.putKey({ label: 'Gemini', secret: 'fixture-google-secret' });
    const preferences = { ...emptyWorkspace().preferences, searchProvider: 'parallel' as const };
    const keys = await localRepository.keys();
    await t.test('Parallel cannot be selected as generator/evaluator; import retains provider separation', async () => {
      assert.equal(availableKeys(keys, preferences).length, 1);
      assert.equal(availableKeys(keys, { ...preferences, keyId: keys.find(k => k.provider === 'parallel')!.id }).length, 0);
      const payload = await localImportPayload();
      assert.equal(payload.keys.filter(k => k.provider === 'parallel').length, 1);
      assert.ok(payload.keys.find(k => k.provider === 'parallel')?.secret);
    });
    let searches = 0; let generations = 0; let invalidCitation = false;
    let generatedRequests: any[] = [];
    const research = { provider: 'parallel' as const, topic: base.topic, searchedAt: new Date().toISOString(), queries: [base.topic], sources: [{ title: 'Primary', url: sourceUrl, snippet: 'A trustworthy concept.' }] };
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/parallel-search')) { searches++; const { topic, config } = JSON.parse(String(init?.body)); return Response.json({ research: { ...research, topic, queries: [topic], scopeKey: config ? assessmentScopeKey(config) : undefined } }); }
      const request = new Request(input, init); const body = await request.json();
      const prompt = body.contents.map((c: any) => c.parts.map((p: any) => p.text || '').join('\n')).join('\n');
      const audit = qualityReviewFixture(prompt);
      if (audit) return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(audit) }] } }] });
      generatedRequests.push(body); generations++;
      const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1]);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ title: 'Quiz', questions: Array.from({ length: count }, (_, i) => ({ ...fixtures.single_choice, question: `Konsep batch ${generations}, soal ${i}?`, sourceUrls: [invalidCitation ? 'https://invented.example' : sourceUrl] })) }) }] } }] });
    };
    globalThis.fetch = streamingFixtureFetch(globalThis.fetch);
    await t.test('one search for entire quiz; evidence checkpoint and valid citations survive', async () => {
      let checkpoint: GenerationJob | undefined;
      const quiz = await generateWorkspaceQuiz({ ...base, questionCount: 6 }, preferences, keys, localRepository, async job => { checkpoint = structuredClone(job); }, new AbortController().signal);
      assert.equal(searches, 1); assert.equal(generations, 1); assert.equal(quiz.questions.length, 6);
      assert.equal(quiz.searchProvider, 'parallel'); assert.equal(quiz.usedGrounding, true); assert.equal(quiz.webCheckedAt, research.searchedAt);
      assert.ok(quiz.questions.every(q => q.groundingSources[0].url === sourceUrl));
      assert.ok(checkpoint?.parallelResearch); assert.ok(generatedRequests.every(r => !r.tools?.length));
      const resumed = { ...checkpoint!, modelCallCount: undefined, status: 'interrupted' as const, questions: [] };
      await generateWorkspaceQuiz(base, preferences, keys, localRepository, async () => {}, new AbortController().signal, resumed);
      assert.equal(searches, 1, 'Resume reuses successful search');
    });
    await t.test('invalid model citations are omitted without blocking generation', async () => {
      invalidCitation = true; const before = generations;
      const quiz = await generateQuizBatch(base, 'fixture-google-secret', [], undefined, research);
      assert.equal(quiz.questions.length, 1); assert.equal(quiz.questions[0].groundingSources.length, 0); assert.ok(quiz.generationWarnings!.length);
      assert.equal(generations - before, 1); invalidCitation = false;
    });
    await t.test('Gemma uses external evidence without native Google Search', async () => {
      const quiz = await generateQuizBatch({ ...base, model: 'gemma-4-31b-it' }, 'fixture-google-secret', [], undefined, research);
      assert.equal(quiz.usedGrounding, true); assert.equal(quiz.searchProvider, 'parallel'); assert.ok(!generatedRequests.at(-1).tools?.length);
    });
    await t.test('missing/disabled Parallel key prevents generation and Google fallback', async () => {
      const before = generations;
      await assert.rejects(generateWorkspaceQuiz(base, preferences, keys.filter(k => k.provider !== 'parallel'), localRepository, async () => {}, new AbortController().signal), /Parallel/);
      assert.equal(generations, before);
    });
    await t.test('manual Parallel access test uses one search and zero model calls', async () => {
      const before = generations; const beforeSearch = searches;
      await testKey(localRepository, keys.find(k => k.provider === 'parallel')!.id, DEFAULT_MODEL);
      assert.equal(searches - beforeSearch, 1); assert.equal(generations, before);
    });
    await t.test('UI masks key, has a single-slot control and separates Gemini selectors', async () => {
      const workspace: any = { keys: await localRepository.keys(), scope: 'guest', mode: 'guest', ready: true, data: emptyWorkspace() };
      const render = (initialTab: 'keys' | 'models') => renderToStaticMarkup(createElement(AISettings, { workspace, initialTab, onClose() {}, onSelectQuiz() {} }));
      const markup = render('keys'); assert.ok(markup.includes('Parallel Search')); assert.ok(markup.includes('1/1')); assert.ok(!markup.includes('fixture-replaced-parallel'));
      assert.ok(markup.includes('Ganti API key')); assert.ok(markup.includes('Uji akses'));
      const modelMarkup = render('models'); assert.ok(modelMarkup.includes('settings-search-provider'));
      assert.ok(!modelMarkup.includes(`value="${keys.find(k => k.provider === 'parallel')!.id}"`));
    });
    await t.test('deletion removes the credential and releases the slot', async () => {
      const key = keys.find(k => k.provider === 'parallel')!; await localRepository.removeKey(key.id);
      await assert.rejects(localCredential(key.id), /tidak ditemukan/);
      await localRepository.putKey({ provider: 'parallel', label: 'New', secret: 'fixture-new-parallel' });
      assert.equal((await localRepository.keys()).filter(k => k.provider === 'parallel').length, 1);
    });
  } finally { globalThis.fetch = originalFetch; }
});

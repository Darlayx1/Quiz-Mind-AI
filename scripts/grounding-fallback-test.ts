import assert from 'node:assert/strict';
import { KeyPool, defaultSettings } from '../src/keyPool.js';
import { generateQuizWithGemini } from '../src/server/geminiService.js';
import { DEFAULT_MODEL } from '../src/models.js';

const key = { id: 'grounding-test', name: 'Test', project: 'test-project', key: 'fake-grounding-secret', enabled: true, priority: 1 };
const config = { topic: 'Aljabar', difficulty: 'moderate' as const, questionCount: 1, timeLimitMinutes: 5, language: 'id' as const, enableGrounding: true, model: DEFAULT_MODEL };
const originalFetch = globalThis.fetch;
const calls: { model: string; grounded: boolean }[] = [];
let mode = 'primary-quota';
const quota = (grounding = false) => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded. fake-grounding-secret',
  ...(grounding ? { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/grounding_requests', quotaId: 'GroundingRequestsPerMinutePerProject', quotaValue: '10' }] }] } : {}) } });
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  assert.ok(req.url.startsWith('https://generativelanguage.googleapis.com/'));
  const body = await req.json();
  const call = { model: decodeURIComponent(req.url.match(/models\/([^:]+):/)?.[1] || ''), grounded: Boolean(body.tools?.length) };
  calls.push(call);
  if (mode === 'invalid-input') return Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid input' } }, { status: 400 });
  if (mode === 'primary-unavailable' && call.model === DEFAULT_MODEL) return Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'Service unavailable' } }, { status: 503 });
  if (mode === 'all-quota' || (mode === 'primary-quota' && call.model === DEFAULT_MODEL) || (mode === 'grounding-quota' && call.grounded)) {
    return Response.json(quota(mode === 'grounding-quota'), { status: 429 });
  }
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Latihan', questions: [{ question: 'Berapa dua ditambah dua?', options: ['Empat', 'Dua', 'Tiga', 'Lima', 'Enam'], correctAnswerIndex: 0, explanation: 'Dua ditambah dua sama dengan empat.' }] }) }] },
    ...(call.grounded ? { groundingMetadata: { webSearchQueries: ['aljabar'], groundingChunks: [{ web: { uri: 'https://example.org/algebra', title: 'Aljabar' } }] } } : {}) }] });
};
const pool = (settings = {}) => new KeyPool({ keys: [key], settings: { ...defaultSettings, ...settings } });
try {
  const notices: string[] = [];
  const fallback = await generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true }), attemptBudget: { calls: 0 }, onNotice: message => notices.push(message) });
  assert.equal(fallback.model, defaultSettings.fallbackModel);
  assert.equal(fallback.usedGrounding, true);
  assert.deepEqual(calls, [{ model: DEFAULT_MODEL, grounded: true }, { model: defaultSettings.fallbackModel, grounded: true }]);
  assert.ok(notices.some(message => /cadangan/.test(message)));

  calls.length = 0;
  const limited = pool();
  await assert.rejects(generateQuizWithGemini(config, undefined, { pool: limited }), (error: any) => error.status === 429 && !error.message.includes(key.key));
  await assert.rejects(generateQuizWithGemini({ ...config, enableGrounding: false }, undefined, { pool: limited }), (error: any) => error.status === 429);
  assert.equal(calls.length, 1, 'Unknown model quota must block the same model with and without grounding');

  mode = 'grounding-quota'; calls.length = 0;
  const noWeb = await generateQuizWithGemini(config, undefined, { pool: pool({ allowGroundingFallback: true }), attemptBudget: { calls: 0 } });
  assert.equal(noWeb.model, DEFAULT_MODEL);
  assert.equal(noWeb.usedGrounding, false);
  assert.deepEqual(noWeb.groundingQueriesUsed, []);
  assert.deepEqual(noWeb.questions[0].groundingSources, []);
  assert.deepEqual(calls, [{ model: DEFAULT_MODEL, grounded: true }, { model: DEFAULT_MODEL, grounded: false }]);

  calls.length = 0;
  const projectSearch = pool({ allowModelFallback: true, allowGroundingFallback: true });
  const projectQuiz = await generateQuizWithGemini(config, undefined, { pool: projectSearch, attemptBudget: { calls: 0 } });
  assert.equal(projectQuiz.usedGrounding, false);
  assert.deepEqual(calls, [{ model: DEFAULT_MODEL, grounded: true }, { model: DEFAULT_MODEL, grounded: false }], 'Project Search quota must not be retried with another grounded model');
  assert.equal(projectSearch.status(key.id, defaultSettings.fallbackModel + ':grounding').state, 'waiting');

  calls.length = 0;
  await assert.rejects(generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true }), attemptBudget: { calls: 0 } }), (error: any) => error.status === 429);
  assert.ok(calls.every(call => call.grounded), 'Grounding cannot be dropped without permission');
  assert.equal(calls.length, 1, 'A project Search quota applies to all grounded models');

  mode = 'all-quota'; calls.length = 0;
  const budget = { calls: 0 };
  await assert.rejects(generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true, allowGroundingFallback: true }), attemptBudget: budget }), (error: any) => error.status === 429);
  assert.equal(calls.length, 2, 'Do not bypass a model quota by removing grounding');
  assert.ok(budget.calls <= 3);

  mode = 'primary-unavailable'; calls.length = 0;
  const transientBudget = { calls: 0 };
  const recovered = await generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true }), attemptBudget: transientBudget });
  assert.equal(recovered.model, defaultSettings.fallbackModel);
  assert.equal(recovered.usedGrounding, true);
  assert.equal(calls.length, 3, 'Primary retry and fallback share a three-request budget');
  assert.equal(transientBudget.calls, 3);

  mode = 'primary-quota'; calls.length = 0;
  const gemmaFallback = await generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true, allowGroundingFallback: true, modelFallbacks: { gemini: 'gemma-4-31b-it' } }), attemptBudget: { calls: 0 } });
  assert.equal(gemmaFallback.model, 'gemma-4-31b-it');
  assert.equal(gemmaFallback.usedGrounding, false);
  assert.deepEqual(calls, [{ model: DEFAULT_MODEL, grounded: true }, { model: 'gemma-4-31b-it', grounded: false }]);
  calls.length = 0;
  await assert.rejects(generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true, modelFallbacks: { gemini: 'gemma-4-31b-it' } }) }), (error: any) => error.status === 429);
  assert.equal(calls.length, 1, 'A non-Search fallback is skipped when web references are required');

  mode = 'invalid-input'; calls.length = 0;
  await assert.rejects(generateQuizWithGemini(config, undefined, { pool: pool({ allowModelFallback: true, allowGroundingFallback: true }) }), (error: any) => error.status === 400);
  assert.equal(calls.length, 1, 'Invalid input must not trigger fallback');

  console.log('PASS grounded quota recovery: configured model fallback preserves sources, optional web fallback, shared model cooldown, safe errors and bounded requests. No external API calls.');
} finally { globalThis.fetch = originalFetch; }

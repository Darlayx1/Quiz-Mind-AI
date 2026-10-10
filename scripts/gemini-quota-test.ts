import assert from 'node:assert/strict';
import { geminiQuotaDetails } from '../src/geminiQuota.js';
import { KeyPool, defaultSettings, errorKind } from '../src/keyPool.js';
import { classifyApiError, generateQuizWithGemini } from '../src/server/geminiService.js';
import { DEFAULT_MODEL } from '../src/models.js';

const key = { id: 'quota-test', name: 'Test', project: 'test-project', key: 'fake-quota-secret', enabled: true, priority: 1 };
const payload = (quotaValue: string) => ({ error: {
  code: 429, status: 'RESOURCE_EXHAUSTED',
  message: 'You exceeded your current quota, please check your plan and billing details. Secret: fake-quota-secret',
  details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{
      quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
      quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue,
    }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12.5s' },
  ],
} });
const error = Object.assign(new Error(JSON.stringify(payload('0'))), { status: 429 });
assert.equal(geminiQuotaDetails(error).zero, true);
assert.equal(geminiQuotaDetails(error).daily, false, 'Zero quota cannot be assumed to recover at midnight');
assert.equal(geminiQuotaDetails(error).projectWide, false, 'Generic billing advice must not block every model');
assert.equal(errorKind({ ...payload('0') }).retryMs, 12_500);
const classified = classifyApiError(error, DEFAULT_MODEL);
assert.equal(classified.status, 429);
assert.match(classified.message, /batas kuota 0/);
assert.ok(!classified.message.includes(key.key));
assert.equal(classifyApiError(Object.assign(new Error(JSON.stringify(payload('401'))), { status: 429 }), DEFAULT_MODEL).status, 429);
assert.equal(geminiQuotaDetails(payload('100')).daily, true);
assert.equal(geminiQuotaDetails(new Error('Quota exceeded for metric: requests, limit: 0, model: gemini')).zero, true);
assert.equal(geminiQuotaDetails(new Error('spending limit exceeded')).projectWide, true);
assert.equal(geminiQuotaDetails(new Error('Unknown restriction')).projectWide, false);
assert.match(classifyApiError(Object.assign(new Error('Unknown restriction'), { status: 429 }), DEFAULT_MODEL).message, /belum dapat dipastikan/);

const originalFetch = globalThis.fetch;
const models: string[] = [];
const config = { topic: 'Aljabar', difficulty: 'moderate' as const, questionCount: 1, timeLimitMinutes: 5, language: 'id' as const, enableGrounding: false, model: DEFAULT_MODEL };
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  const model = decodeURIComponent(req.url.match(/models\/([^:]+):/)?.[1] || '');
  models.push(model);
  if (model === DEFAULT_MODEL) return Response.json(payload('0'), { status: 429 });
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Latihan', questions: [{ question: 'Berapa hasil dua ditambah dua?', options: ['Empat', 'Dua', 'Tiga', 'Lima', 'Enam'], correctAnswerIndex: 0, explanation: 'Dua ditambah dua sama dengan empat.' }] }) }] } }] });
};
try {
  const pool = new KeyPool({ keys: [key], settings: { ...defaultSettings, allowModelFallback: true } });
  const quiz = await generateQuizWithGemini(config, undefined, { pool, attemptBudget: { calls: 0 } });
  assert.equal(quiz.model, defaultSettings.fallbackModel);
  assert.deepEqual(models, [DEFAULT_MODEL, defaultSettings.fallbackModel]);
  assert.ok(pool.status(key.id, DEFAULT_MODEL).until! - Date.now() <= 12_500);
  assert.ok(JSON.stringify(pool.monitoring()).includes('batas kuota 0'));
  assert.ok(!JSON.stringify(pool.monitoring()).includes(key.key));

  const limited = new KeyPool({ keys: [key], settings: { ...defaultSettings } });
  const before = models.length;
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(generateQuizWithGemini(config, undefined, { pool: limited }), (err: any) => err.status === 429 && /batas kuota 0/.test(err.message) && !err.message.includes(key.key));
  }
  assert.equal(models.length - before, 1, 'Cached cooldown preserves evidence without another API request');
  limited.reset(key.id);
  assert.equal(limited.status(key.id, DEFAULT_MODEL).state, 'untested');
  const daily = new KeyPool({ keys: [key], settings: { ...defaultSettings } });
  await assert.rejects(daily.run(async () => { throw Object.assign(new Error(JSON.stringify(payload('100'))), { status: 429 }); }, { model: DEFAULT_MODEL }));
  assert.ok(daily.status(key.id, DEFAULT_MODEL).until! > Date.now() + 12_500);
  console.log('PASS Gemini quota: zero limits, daily limits, SDK JSON, retry hints, safe diagnostics, model fallback despite generic billing advice, cached cooldown. No external API calls.');
} finally { globalThis.fetch = originalFetch; }

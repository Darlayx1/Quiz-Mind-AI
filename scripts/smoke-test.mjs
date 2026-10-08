import worker from '../dist/server/index.js';
import assert from 'node:assert/strict';

const call = (pathname, body) => worker.fetch(new Request('https://quiz.test' + pathname,
  body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), {});
const home = await call('/');
assert.equal(home.status, 200);
const html = await home.text();
assert.ok(!html.includes('/src/main'));
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assert.equal((await call(match[1])).status, 200);
assert.equal((await call('/history')).status, 200);
assert.equal((await call('/assets/missing.js')).status, 404);
assert.equal((await call('/api/health')).status, 200);
assert.deepEqual((await (await call('/api/health')).json()).models, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemma-4-31b-it', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar', provider: 'groq' })).status, 503);
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar', provider: 'groq', model: 'gemini-3.8-flash' })).status, 400);
assert.ok(html.includes('https://api.groq.com'));
assert.equal((await call('/api/missing')).status, 404);
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar' })).status, 503);
assert.equal((await call('/api/generate-quiz', { topic: '' })).status, 400);
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar', model: 'not-a-model' })).status, 400);
for (const invalid of [{ questionCount: 101 }, { questionCount: 2.5 }, { questionCount: 0 }, { difficulty: 'invalid' }, { displayMode: 'invalid' }, { timeLimitMinutes: -1 }, { timePerQuestionSeconds: 601 }]) {
  assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar', ...invalid })).status, 400);
}
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar', questionCount: 25, timeLimitMinutes: 0, displayMode: 'sequential', timePerQuestionSeconds: 0 })).status, 503);
assert.equal((await call('/api/vault/encrypt', { text: 'Uji deployment' })).status, 404);
assert.equal((await call('/api/vault/decrypt', { encrypted: 'anything' })).status, 404);
assert.equal((await (await call('/api/keys/capabilities')).json()).configured, false);
console.log('PASS: halaman, aset, health, validasi, missing-key, endpoint dekripsi publik dihapus, kapabilitas vault');

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
assert.equal((await call('/api/missing')).status, 404);
assert.equal((await call('/api/generate-quiz', { topic: 'Aljabar' })).status, 503);
assert.equal((await call('/api/generate-quiz', { topic: '' })).status, 400);
const encrypted = await (await call('/api/vault/encrypt', { text: 'Uji deployment', secret: 'test-only-secret' })).json();
const decrypted = await (await call('/api/vault/decrypt', { encrypted: encrypted.encrypted, secret: 'test-only-secret' })).json();
assert.equal(decrypted.decrypted, 'Uji deployment');
console.log('PASS: halaman, aset, health, API 404, validasi, missing-key, vault round-trip');

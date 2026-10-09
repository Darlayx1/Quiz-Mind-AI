import assert from 'node:assert/strict';
import { KeyPool, defaultSettings, validateCollection } from '../src/keyPool.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { encryptCollection, decryptCollection, MULTI_VAULT_KEY } from '../src/multiKeyVault.js';
import { generateQuiz } from '../src/server/aiService.js';
import { probeKey } from '../src/server/providerClient.js';
import type { QuizConfig } from '../src/types/quiz.js';
import express from 'express';
import { ServerKeyStore } from '../src/server/keyStore.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

const keys = [
  { id: 'google', name: 'Gemini Primary', provider: 'gemini' as const, key: 'fake-google-secret', project: 'proj-1', priority: 1, enabled: true },
  { id: 'google-backup', name: 'Gemini Backup', provider: 'gemini' as const, key: 'fake-google-backup', project: 'proj-2', priority: 2, enabled: true },
];
const config: QuizConfig = { provider: 'gemini', model: 'gemini-3.8-flash', topic: 'Aljabar', difficulty: 'easy', questionCount: 2, timeLimitMinutes: 5, language: 'id', enableGrounding: true };
const originalFetch = globalThis.fetch;
const calls: { provider: string; key: string; model?: string; body?: any }[] = [];
let failGoogle = 0, malformed = false, invalidQuestion = false, truncate = false, serial = 0, slow = false;
let googleMode = 'grounded';

const makeQuiz = (count: number) => ({
  title: 'Aljabar',
  topic: 'Aljabar',
  summary: 'Konsep aljabar.',
  questions: Array.from({ length: count }, () => ({
    question: `Pertanyaan ${++serial}: berapa dua tambah dua?`,
    options: invalidQuestion ? ['4', '4', '4', '4'] : ['4', '3', '5', '6', '7'],
    correctAnswerIndex: invalidQuestion ? 8 : 0,
    explanation: 'Dua tambah dua adalah empat.',
    topicCategory: 'Penjumlahan',
    referenceTitle: ''
  }))
});

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (!request.url.startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(input, init);
  const provider = 'gemini';
  const body = request.method === 'POST' ? await request.json() : undefined;
  const key = request.headers.get('x-goog-api-key') ?? '';
  const model = decodeURIComponent(request.url.match(/models\/([^:]+):/)?.[1] ?? '');
  calls.push({ provider, key, model, body });
  if (slow) {
    request.signal.throwIfAborted();
    await new Promise((_resolve, reject) => {
      const watchdog = setTimeout(() => reject(request.signal.aborted ? request.signal.reason : new Error('Mock cancellation timed out')), 1000);
      request.signal.addEventListener('abort', () => { clearTimeout(watchdog); reject(request.signal.reason); }, { once: true });
    });
  }
  if (failGoogle) {
    return Response.json({ error: { code: failGoogle, message: 'Test Google Gemini error', status: failGoogle === 401 ? 'UNAUTHENTICATED' : 'RESOURCE_EXHAUSTED' } }, { status: failGoogle, headers: { 'retry-after': '120' } });
  }
  if (request.method === 'GET') {
    return Response.json({ models: [{ name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'], supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'], supportedGenerationMethods: ['generateContent'] }] });
  }
  const prompt = JSON.stringify(body?.contents);
  const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1] ?? 1);
  const content = malformed ? 'not json' : JSON.stringify(makeQuiz(count));
  const candidate: any = { content: { role: 'model', parts: [{ text: content }] } };
  if (truncate) candidate.finishReason = 'MAX_TOKENS';
  if (googleMode === 'grounded') {
    candidate.groundingMetadata = {
      webSearchQueries: ['aljabar'],
      groundingChunks: [{ web: { uri: 'https://example.org/algebra', title: 'Aljabar' } }]
    };
  }
  return Response.json({ candidates: [candidate] });
};

const reset = () => { calls.length = 0; failGoogle = 0; malformed = invalidQuestion = truncate = slow = false; googleMode = 'grounded'; };

try {
  // Test config normalization
  assert.equal(normalizeQuizConfig({ topic: 'Aljabar' }).provider, 'gemini');
  assert.equal(normalizeQuizConfig({ topic: 'Aljabar', provider: 'gemini' }).model, 'gemini-3.8-flash');
  assert.throws(() => normalizeQuizConfig({ ...config, provider: 'groq' as any }), /Penyedia AI tidak didukung/);
  assert.throws(() => normalizeQuizConfig({ ...config, model: 'https://untrusted.invalid' }), /tidak didukung/);

  // Legacy migration test: collection with legacy groq keys filters groq keys out
  const legacyCollection = validateCollection({
    keys: [
      { id: 'google', name: 'Gemini', provider: 'gemini', key: 'fake-google-secret', project: 'same-id', priority: 1, enabled: true },
      { id: 'groq-old', name: 'Old Groq', provider: 'groq', key: 'fake-groq-secret', project: 'same-id', priority: 2, enabled: true }
    ],
    settings: { ...defaultSettings, preferredProvider: 'groq' as any, fallbackProvider: 'groq' as any }
  });
  assert.equal(legacyCollection.keys.length, 1);
  assert.equal(legacyCollection.keys[0].id, 'google');
  assert.equal(legacyCollection.settings.preferredProvider, 'gemini');
  assert.equal(legacyCollection.settings.fallbackProvider, 'gemini');

  // Encryption and decryption of Gemini collection
  const collection = validateCollection({ keys, settings: { ...defaultSettings } });
  const backup = await encryptCollection(collection, 'fake-backup-password');
  assert.equal(JSON.parse(backup).version, 3);
  assert.deepEqual(await decryptCollection(backup, 'fake-backup-password'), collection);

  // Genuine v2 vault payload migration test
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode('fake-legacy-password'), 'PBKDF2', false, ['deriveKey']);
  const cipherKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(MULTI_VAULT_KEY) }, cipherKey, new TextEncoder().encode(JSON.stringify({ keys: [{ ...keys[0], provider: undefined }], settings: { mode: 'priority', allowModelFallback: false, allowGroundingFallback: false } })));
  const v2 = JSON.stringify({ version: 2, iterations: 600000, salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64'), ciphertext: Buffer.from(bytes).toString('base64') });
  assert.equal((await decryptCollection(v2, 'fake-legacy-password')).keys[0].provider, 'gemini');

  // Generation test with Gemini
  let pool = new KeyPool(collection);
  const quiz = await generateQuiz(config, undefined, { pool });
  assert.equal(quiz.questions.length, 2);
  assert.equal(quiz.provider, 'gemini');
  assert.equal(quiz.usedGrounding, true);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0].provider, 'gemini');
  assert.equal(calls[0].key, 'fake-google-secret');

  // Probe key test
  const probed = await probeKey(keys[0]);
  assert.ok(probed.includes('gemini-3.8-flash'));

  // Key fallback on rate limit / error
  reset(); failGoogle = 429;
  pool = new KeyPool(collection);
  await assert.rejects(generateQuiz({ ...config, questionCount: 1 }, undefined, { pool }));
  assert.equal(pool.status('google').state, 'waiting');

  // Model fallback test
  reset();
  pool = new KeyPool({ ...collection, settings: { ...defaultSettings, allowModelFallback: true } });
  const mockFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    if (req.method === 'POST' && req.url.includes('models/gemini-3.8-flash:')) {
      return Response.json({ error: { code: 404, message: 'Model not found', status: 'NOT_FOUND' } }, { status: 404 });
    }
    return mockFetch(input, init);
  };
  const fallbackQuiz = await generateQuiz({ ...config, questionCount: 1, enableGrounding: false }, undefined, { pool });
  assert.equal(fallbackQuiz.model, 'gemini-3.5-flash-lite');
  globalThis.fetch = mockFetch;

  // ServerKeyStore tests
  const dir = mkdtempSync(path.join(tmpdir(), 'quizmind-provider-test-'));
  const loginPassword = 'fake-test-owner-password', loginSalt = randomBytes(16);
  const store = new ServerKeyStore({ VAULT_USERNAME: 'tester', VAULT_PASSWORD_HASH: `scrypt$${loginSalt.toString('hex')}$${scryptSync(loginPassword, loginSalt, 64).toString('hex')}`, ENCRYPTION_SECRET: 'fake-only-test-encryption-secret-32-characters', DATA_DIR: dir, NODE_ENV: 'test' });
  const app = express(); app.use(express.json()); store.install(app);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/keys/`;
  let cookie = '', csrf = '';
  const call = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-vault-csrf': csrf }, body: JSON.stringify(body) });
  try {
    let res = await call('login', { username: 'tester', password: loginPassword });
    cookie = res.headers.get('set-cookie')!.split(';')[0];
    csrf = (await res.json()).csrf;
    res = await call('add', { keys: [keys[0]], revision: 0 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).keys[0].provider, 'gemini');
    res = await call('test', { id: 'google' });
    assert.equal(res.status, 200);
    const tested = await res.json();
    assert.ok(tested.models.includes('gemini-3.8-flash'));
    assert.equal(JSON.stringify(tested).includes(keys[0].key), false);
    res = await call('export', { password: 'fake-backup-password' });
    const exported = await res.json();
    assert.equal((await decryptCollection(exported.backup, 'fake-backup-password')).keys[0].provider, 'gemini');
  } finally {
    store.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('PASS providers: Gemini pooling, fallback models, grounding compatibility, legacy Groq migration, encrypted vault backup, server probes. No external API calls.');
} finally {
  globalThis.fetch = originalFetch;
}

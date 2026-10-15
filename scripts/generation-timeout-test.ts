import assert from 'node:assert/strict';
import { classifyApiError, generateQuizBatch } from '../src/server/geminiService.js';
import { DEFAULT_MODEL } from '../src/models.js';
import { fixtures } from './assessment-fixtures.js';

for (const error of [
  new DOMException('Deadline exceeded', 'TimeoutError'),
  new Error('Request timed out.'),
  Object.assign(new Error('Request aborted by SDK'), { cause: { code: 'UND_ERR_BODY_TIMEOUT' } }),
  Object.assign(new Error('Provider request timeout'), { status: 408 }),
]) assert.equal(classifyApiError(error, DEFAULT_MODEL).code, 'TIMEOUT');
for (const error of [
  new TypeError('terminated'),
  Object.assign(new Error('Socket closed'), { cause: { code: 'UND_ERR_SOCKET' } }),
  new Error('Incomplete JSON segment at the end'),
]) assert.equal(classifyApiError(error, DEFAULT_MODEL).code, 'NETWORK_ERROR');
assert.equal(classifyApiError(Object.assign(new Error('Bad Gateway'), { status: 502 }), DEFAULT_MODEL).code, 'PROVIDER_GATEWAY_ERROR');

const originalFetch = globalThis.fetch;
const config = { model: DEFAULT_MODEL, topic: 'Konsep', questionCount: 1, difficulty: 'easy' as const,
  timeLimitMinutes: 0, language: 'id' as const, enableGrounding: false };
let calls = 0;
try {
  globalThis.fetch = async (input, init) => {
    calls++;
    const request = new Request(input, init);
    assert.equal(request.headers.get('x-server-timeout'), '180', 'Provider receives the same explicit deadline as the application');
    const text = JSON.stringify({ title: 'Konsep', questions: [fixtures.single_choice] });
    return new Response(new ReadableStream({ async start(controller) {
      // Headers can arrive before a long thinking phase with no quiz text.
      await new Promise(resolve => setTimeout(resolve, 25));
      const event = (chunk: unknown) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(chunk) + '\n\n'));
      event({ candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }] } }] });
      event({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
      controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const quiz = await generateQuizBatch(config, 'fixture-only', [], undefined, undefined, undefined, { stream: true });
  assert.equal(quiz.questions.length, 1);
  assert.equal(calls, 1, 'Slow generation must not trigger duplicate requests');

  globalThis.fetch = async () => {
    calls++;
    return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')); } }),
      { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const before = calls;
  await assert.rejects(generateQuizBatch(config, 'fixture-only', [], undefined, undefined, undefined, { stream: true }),
    (error: any) => error.code === 'NETWORK_ERROR');
  assert.equal(calls - before, 1, 'A broken stream must not redispatch a potentially consumed request');
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: explicit provider deadline, delayed stream success, timeout/socket/gateway diagnosis and no duplicate dispatch. No external API calls.');

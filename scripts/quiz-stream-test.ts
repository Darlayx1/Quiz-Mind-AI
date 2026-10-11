import assert from 'node:assert/strict';
import { QuestionStreamCounter, collectQuizStream } from '../src/server/quizStream.js';
import type { GenerateContentResponse } from '@google/genai';

const text = JSON.stringify({ title: 'questions', questions: [
  { question: 'Teks dengan } ] dan "questions": [ serta \\ dalam string', rubric: [{ description: 'Nested }', anchors: ['a', 'b', 'c'] }] },
  { question: 'Kedua', items: [{ id: 'i1', text: 'one' }] }
], summary: 'Akhir' });
for (const size of [1, 2, 7, 64, text.length]) {
  const counter = new QuestionStreamCounter();
  for (let i = 0; i < text.length; i += size) counter.append(text.slice(i, i + size));
  assert.equal(counter.count, 2, `Quotes, escapes and nested objects across chunks of size ${size}`);
}
const incomplete = new QuestionStreamCounter();
incomplete.append('{"questions":[{"question":"Belum selesai');
assert.equal(incomplete.count, 0);
const progress: number[] = [];
async function* chunks() {
  yield { promptFeedback: { blockReasonMessage: 'metadata from first chunk' }, candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }] } }] } as GenerateContentResponse;
  for (let i = 0; i < text.length; i += 7) yield { candidates: [{ content: { parts: [{ text: text.slice(i, i + 7) }] },
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.org/reference', title: 'Evidence' } }], webSearchQueries: ['reference'] } }] } as GenerateContentResponse;
  yield { candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, thoughtsTokenCount: 450, candidatesTokenCount: 200 } } as GenerateContentResponse;
}
const response = await collectQuizStream(chunks(), new AbortController().signal, Date.now(), count => progress.push(count));
assert.equal(response.text, text, 'Keep complete output and exclude thought content');
assert.deepEqual(progress, [1, 2]);
assert.equal(response.candidates[0].finishReason, 'STOP');
assert.equal(response.candidates[0].groundingMetadata?.groundingChunks?.length, 1, 'Do not duplicate citations repeated across chunks');
assert.deepEqual(response.candidates[0].groundingMetadata?.webSearchQueries, ['reference']);
assert.equal(response.usageMetadata?.thoughtsTokenCount, 450);
assert.equal(response.promptFeedback?.blockReasonMessage, 'metadata from first chunk');
const cancel = new AbortController();
async function* interrupted() {
  yield { candidates: [{ content: { parts: [{ text: '{"questions":[' }] } }] } as GenerateContentResponse;
  cancel.abort(new DOMException('Cancelled', 'AbortError'));
  yield {} as GenerateContentResponse;
}
await assert.rejects(collectQuizStream(interrupted(), cancel.signal, Date.now()), (error: any) => error.name === 'AbortError');
console.log('PASS: incremental JSON across chunk boundaries, real progress, thought privacy, terminal metadata, citations, usage and cancellation. No external API requests.');

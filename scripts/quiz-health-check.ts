// Explicit live canary. Credentials remain in the process and memory-only IndexedDB.
import 'fake-indexeddb/auto';
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { localRepository } from '../src/workspace/localRepository.js';
import { generateWorkspaceQuiz } from '../src/workspace/ai.js';
import { emptyWorkspace } from '../src/workspace/types.js';

dotenv.config({ quiet: true });
if (!process.argv.includes('--live')) throw new Error('Use --live to authorize a provider call.');
const secret = process.env.GEMINI_API_KEY;
if (!secret) throw new Error('GEMINI_API_KEY is missing.');
const start = Date.now();
let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input instanceof Request ? input.url : input).includes('generativelanguage.googleapis.com')) providerCalls++;
  return originalFetch(input, init);
};
try {
  await localRepository.putKey({ label: 'Memory-only audit', secret });
  const quiz = await generateWorkspaceQuiz({ topic: 'Anatomi manusia', questionType: 'single_choice', questionCount: 10,
    difficulty: 'moderate', timeLimitMinutes: 15, language: 'id', enableGrounding: true },
  emptyWorkspace().preferences, await localRepository.keys(), localRepository, async () => {}, AbortSignal.timeout(120000));
  assert.equal(quiz.questions.length, 10);
  assert.ok(quiz.questions.every(q => q.type === 'single_choice'));
  assert.ok(new Set(quiz.questions.map(q => q.question.toLowerCase().trim())).size === 10);
  assert.ok(quiz.usedGrounding && quiz.webCheckedAt && !quiz.groundingFallbackUsed, 'Live canary requires real search evidence.');
  assert.ok(quiz.questions.every(q => q.groundingSources.some(s => /^https?:\/\//i.test(s.url))), 'Sources required for every question.');
  assert.ok(providerCalls <= 6, 'At most three attempts per batch.');
  console.log(JSON.stringify({ status: 'success', questions: 10, providerCalls,
    groundingFallback: !!quiz.groundingFallbackUsed, durationMs: Date.now() - start }));
} catch (error) {
  const safe = error as { code?: string; status?: number; message?: string };
  console.log(JSON.stringify({ status: 'failed', code: safe.code || 'CANARY_FAILED', httpStatus: safe.status,
    detail: safe.code ? undefined : safe.message?.replaceAll(secret, '[redacted]'),
    providerCalls, durationMs: Date.now() - start }));
  process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; }

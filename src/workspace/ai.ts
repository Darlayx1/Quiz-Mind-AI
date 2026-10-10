import { normalizeQuizConfig } from '../quizConfig.js';
import { localCredential } from './localRepository.js';
import { supabase, SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';
import { keyStatus, availableKeys, type ApiKeyRecord, type GenerationJob, type Preferences, type WorkspaceRepository } from './types.js';
import type { Quiz, QuizConfig } from '../types/quiz.js';
import { usableResearch, type ParallelResearch } from '../server/parallelSearch.js';

export { availableKeys } from './types.js';
export async function invokeAccount(body: Record<string, unknown>, signal?: AbortSignal, expectedOwner?: string) {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Sesi berakhir. Masuk kembali untuk melanjutkan.');
  if (expectedOwner && session.session.user.id !== expectedOwner) throw new Error('Identitas akun berubah. Operasi dihentikan.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/quiz-ai`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.session.access_token}` }, body: JSON.stringify(body),
  });
  let result: any;
  try { result = await response.json(); } catch { throw new Error('Layanan AI akun belum merespons. Data lokal tidak digunakan sebagai cadangan.'); }
  if (!response.ok) throw Object.assign(new Error(result.error || 'Layanan AI akun belum tersedia.'), { status: response.status, code: result.code });
  return result;
}
export async function testKey(repository: WorkspaceRepository, id: string, model: Preferences['model']) {
  if (repository.scope !== 'guest') return invokeAccount({ action: 'test', keyId: id, model }, undefined, repository.scope);
  try {
    const record = (await repository.keys()).find(k => k.id === id && k.enabled);
    if (!record) throw new Error('Key aktif tidak ditemukan.');
    if (record.provider === 'parallel') {
      await guestParallelSearch('Penjumlahan sederhana', await localCredential(id));
      await repository.recordKeyOutcome(id, 'available'); return;
    }
    const { generateQuizBatch } = await import('../server/geminiService.js');
    // Tests model access with one small call, only after an explicit user action.
    await generateQuizBatch({ model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false }, await localCredential(id));
    await repository.recordKeyOutcome(id, 'available');
  } catch (e) { await repository.recordKeyOutcome(id, keyStatus(e)); throw e; }
}
export async function guestParallelSearch(topic: string, secret: string, signal?: AbortSignal): Promise<ParallelResearch> {
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)]);
  const sameOrigin = import.meta.env?.VITE_PARALLEL_RELAY_MODE === 'same-origin';
  const endpoint = sameOrigin ? '/api/parallel-search' : `${SUPABASE_URL}/functions/v1/parallel-search`;
  const response = await fetch(endpoint, { method: 'POST', signal: bounded,
    headers: { 'Content-Type': 'application/json', ...(!sameOrigin ? { apikey: PUBLISHABLE_KEY } : {}) }, body: JSON.stringify({ topic, secret }) });
  let body;
  try { body = await response.json(); } catch { throw new Error('Relay Parallel belum tersedia pada deployment ini.'); }
  if (!response.ok) throw Object.assign(new Error(body.error || 'Pencarian Parallel gagal.'), { status: response.status, code: body.code });
  if (!usableResearch(body.research, topic)) throw new Error('Respons pencarian Parallel tidak valid.');
  return body.research;
}
export async function generateWorkspaceQuiz(input: QuizConfig, preferences: Preferences, keys: ApiKeyRecord[], repository: WorkspaceRepository,
  checkpoint: (job: GenerationJob) => Promise<unknown>, signal: AbortSignal, resume?: GenerationJob,
  onProgress?: (count: number, total: number) => void): Promise<Quiz> {
  const config = normalizeQuizConfig({ ...input, model: preferences.model, enableGrounding: preferences.grounding });
  let job: GenerationJob = resume ? structuredClone(resume) : { id: crypto.randomUUID(), config, preferences: structuredClone(preferences),
    questions: [], status: 'running', createdAt: new Date().toISOString() };
  job.status = 'running'; await checkpoint(job);
  if (job.preferences.grounding && job.quiz?.groundingFallbackUsed) throw new Error('Kuis sebelumnya dibuat tanpa web. Buat kuis baru agar seluruh soal memakai pencarian web.');
  const eligible = availableKeys(keys, job.preferences);
  if (!eligible.length) throw new Error('Tambahkan atau aktifkan API key pada ruang penyimpanan ini.');
  if (job.preferences.grounding && job.preferences.searchProvider === 'parallel' && repository.scope === 'guest') {
    const searchKey = keys.find(k => k.provider === 'parallel' && k.enabled);
    if (!searchKey) throw new Error('Tambahkan atau aktifkan satu API key Parallel pada Pengaturan AI.');
    if (!usableResearch(job.parallelResearch, job.config.topic)) {
      try {
        job.parallelResearch = await guestParallelSearch(job.config.topic, await localCredential(searchKey.id), signal);
        await repository.recordKeyOutcome(searchKey.id, 'available'); await checkpoint(job);
      } catch (error) { if (!signal.aborted) await repository.recordKeyOutcome(searchKey.id, keyStatus(error)); throw error; }
    }
  }
  let keyIndex = 0;
  while (job.questions.length < job.config.questionCount) {
    signal.throwIfAborted();
    if (repository.scope !== 'guest') {
      const result = await invokeAccount({ action: 'generate', operationId: job.id, config: job.config, preferences: job.preferences }, signal, repository.scope);
      job.quiz = result.quiz; job.questions = result.quiz.questions;
    } else {
      const { generateQuizBatch, classifyApiError, nextQuizBatch, isRetryableGenerationError } = await import('../server/geminiService.js');
      const batchConfig = nextQuizBatch(job.config, job.questions);
      let batch: Quiz | undefined; let last: unknown;
      const attempts = Math.max(1, Math.min(3, job.preferences.maxAttempts));
      for (let attempt = 0; attempt < attempts; attempt++) {
        signal.throwIfAborted(); const key = eligible[keyIndex];
        try {
          batch = await generateQuizBatch(batchConfig, await localCredential(key.id), job.questions.map(q => q.question), signal,
            job.preferences.grounding && job.preferences.searchProvider === 'parallel' ? job.parallelResearch : undefined);
          await repository.recordKeyOutcome(key.id, 'available'); break;
        } catch (error) {
          if (signal.aborted) throw error;
          const classified = classifyApiError(error, job.preferences.model);
          last = classified; const status = keyStatus(classified); await repository.recordKeyOutcome(key.id, status);
          if (!isRetryableGenerationError(classified)) break;
          if ((classified.code || '').startsWith('PARALLEL_')) break;
          if (['invalid','quota'].includes(status)) { if (keyIndex + 1 >= eligible.length) break; keyIndex++; }
          // Different eligible key or a bounded transient retry. No nested retry or model substitution.
        }
      }
      if (!batch) throw last || new Error('Batch belum berhasil.');
      job.questions.push(...batch.questions);
      job.quiz = { ...batch, ...job.config, id: job.id, questions: job.questions,
        groundingQueriesUsed: [...new Set([...(job.quiz?.groundingQueriesUsed || []), ...(batch.groundingQueriesUsed || [])])] };
    }
    signal.throwIfAborted();
    job.status = job.questions.length === job.config.questionCount ? 'completed' : 'running';
    await checkpoint(job); onProgress?.(job.questions.length, job.config.questionCount);
  }
  return job.quiz!;
}

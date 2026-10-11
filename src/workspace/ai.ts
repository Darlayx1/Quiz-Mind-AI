import { normalizeQuizConfig } from '../quizConfig.js';
import { localCredential } from './localRepository.js';
import { supabase, SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';
import { keyStatus, availableKeys, type ApiKeyRecord, type GenerationJob, type Preferences, type WorkspaceRepository } from './types.js';
import type { Quiz, QuizConfig } from '../types/quiz.js';
import { usableResearch, type ParallelResearch } from '../server/parallelSearch.js';
import { stableResearchFallbackCodes } from '../server/assessmentPolicy.js';

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
export async function guestParallelSearch(topic: string, secret: string, signal?: AbortSignal, config?: QuizConfig): Promise<ParallelResearch> {
  const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)]);
  const sameOrigin = import.meta.env?.VITE_PARALLEL_RELAY_MODE === 'same-origin';
  const endpoint = sameOrigin ? '/api/parallel-search' : `${SUPABASE_URL}/functions/v1/parallel-search`;
  const response = await fetch(endpoint, { method: 'POST', signal: bounded,
    headers: { 'Content-Type': 'application/json', ...(!sameOrigin ? { apikey: PUBLISHABLE_KEY } : {}) }, body: JSON.stringify({ topic, secret, config }) });
  let body;
  try { body = await response.json(); } catch { throw new Error('Relay Parallel belum tersedia pada deployment ini.'); }
  if (!response.ok) throw Object.assign(new Error(body.error || 'Pencarian Parallel gagal.'), { status: response.status, code: body.code });
  if (!usableResearch(body.research, topic, config)) throw new Error('Respons pencarian Parallel tidak valid atau berbeda dari cakupan kuis.');
  return body.research;
}
export async function generateWorkspaceQuiz(input: QuizConfig, preferences: Preferences, keys: ApiKeyRecord[], repository: WorkspaceRepository,
  checkpoint: (job: GenerationJob) => Promise<unknown>, signal: AbortSignal, resume?: GenerationJob,
  onProgress?: (count: number, total: number) => void): Promise<Quiz> {
  const config = normalizeQuizConfig({ ...input, model: preferences.model, enableGrounding: preferences.grounding });
  let job: GenerationJob = resume ? structuredClone(resume) : { id: crypto.randomUUID(), config, preferences: structuredClone(preferences),
    questions: [], status: 'running', createdAt: new Date().toISOString() };
  job.config = normalizeQuizConfig(job.config);

  if (job.status === 'completed' && job.quiz) {
    onProgress?.(job.questions.length, job.config.questionCount);
    return job.quiz;
  }
  if (job.modelCallCount && job.modelCallCount > 0) {
    throw new Error('Operasi ini telah dikonsumsi hak pengirimannya ke model AI.');
  }

  job.status = 'running'; await checkpoint(job);
  const eligible = availableKeys(keys, job.preferences);
  if (!eligible.length) throw new Error('Tambahkan atau aktifkan API key pada ruang penyimpanan ini.');
  if (job.preferences.grounding && job.preferences.searchProvider === 'parallel' && repository.scope === 'guest') {
    const searchKey = keys.find(k => k.provider === 'parallel' && k.enabled);
    if (!searchKey) throw new Error('Tambahkan atau aktifkan satu API key Parallel pada Pengaturan AI.');
    if (!job.parallelFallback && !usableResearch(job.parallelResearch, job.config.topic, job.config)) {
      try {
        job.parallelResearch = await guestParallelSearch(job.config.topic, await localCredential(searchKey.id), signal, job.config);
        await repository.recordKeyOutcome(searchKey.id, 'available'); await checkpoint(job);
      } catch (error) {
        if (signal.aborted) throw error;
        const code = String((error as { code?: string }).code || '');
        if (stableResearchFallbackCodes.includes(code)) {
          job.parallelFallback = code;
          await repository.recordKeyOutcome(searchKey.id, 'available'); await checkpoint(job);
        } else { await repository.recordKeyOutcome(searchKey.id, keyStatus(error)); throw error; }
      }
    }
  }

  signal.throwIfAborted();
  if (repository.scope !== 'guest') {
    let result: any;
    try {
      const startRes = await invokeAccount(
        { action: 'start', operationId: job.id, config: job.config, preferences: job.preferences },
        signal,
        repository.scope
      );
      if (startRes.complete && startRes.quiz) {
        result = startRes;
      } else {
        const startTime = Date.now();
        const maxWaitMs = 180000;
        while (true) {
          signal.throwIfAborted();
          if (Date.now() - startTime > maxWaitMs) {
            throw new Error('Waktu tunggu pembuatan kuis habis (180 detik). Silakan coba lagi.');
          }
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 2500 + Math.random() * 500);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(signal.reason || new DOMException('Operasi dibatalkan', 'AbortError'));
            }, { once: true });
          });
          signal.throwIfAborted();

          const pollRes = await invokeAccount(
            { action: 'status', operationId: job.id },
            signal,
            repository.scope
          );
          if (Number.isInteger(pollRes.receivedQuestionCount) && pollRes.receivedQuestionCount > 0) {
            onProgress?.(Math.min(pollRes.receivedQuestionCount, job.config.questionCount), job.config.questionCount);
          }

          if (pollRes.complete && pollRes.quiz) {
            result = pollRes;
            break;
          }
          if (pollRes.error || ['failed_after_dispatch', 'failed_preflight', 'failed'].includes(pollRes.status)) {
            throw Object.assign(new Error(pollRes.error || 'Operasi pembuatan kuis di server belum berhasil.'), {
              code: 'GENERATION_FAILED',
              status: 502
            });
          }
          if (pollRes.status === 'cancelled') {
            throw Object.assign(new Error('Pembuatan kuis dibatalkan.'), { code: 'CANCELLED', status: 409 });
          }
        }
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        try {
          await invokeAccount({ action: 'cancel', operationId: job.id }, undefined, repository.scope);
        } catch { /* best effort cancel */ }
        job.status = 'cancelled';
        await checkpoint(job);
        throw err;
      }
      if (err?.status === 400 && String(err.message).includes('Operasi tidak valid')) {
        // Fallback for older backend deployments where action 'start' is not recognized
        result = await invokeAccount({ action: 'generate', operationId: job.id, config: job.config, preferences: job.preferences }, signal, repository.scope);
      } else {
        job.status = 'failed';
        await checkpoint(job);
        throw err;
      }
    }

    job.quiz = result.quiz;
    job.questions = result.quiz.questions;
    job.status = 'completed';
    await checkpoint(job);
    onProgress?.(job.questions.length, job.config.questionCount);
    return job.quiz!;
  }

  const { generateQuizBatch, classifyApiError } = await import('../server/geminiService.js');
  const key = eligible[0];
  job.dispatchReservedAt = new Date().toISOString();
  job.modelCallCount = 1;
  await checkpoint(job);

  try {
    const fullQuiz = await generateQuizBatch(
      { ...job.config, enableGrounding: job.parallelFallback ? false : job.config.enableGrounding },
      await localCredential(key.id),
      [],
      signal,
      job.preferences.grounding && job.preferences.searchProvider === 'parallel' && !job.parallelFallback ? job.parallelResearch : undefined,
      undefined,
      { stream: true, onProgress: count => onProgress?.(Math.min(count, job.config.questionCount), job.config.questionCount) }
    );
    if (job.parallelFallback) {
      fullQuiz.groundingFallbackUsed = true;
      fullQuiz.generationWarnings = [...(fullQuiz.generationWarnings || []), 'Referensi web tidak tersedia. Kuis dibuat tanpa referensi web; informasi terbaru belum diverifikasi.'];
    }
    await repository.recordKeyOutcome(key.id, 'available');
    job.quiz = {
      ...fullQuiz,
      ...job.config,
      id: job.id,
      questions: fullQuiz.questions,
      qualityReviews: fullQuiz.qualityReviews || [],
      generationWarnings: fullQuiz.generationWarnings || [],
      generationMetrics: fullQuiz.generationMetrics || [],
      groundingQueriesUsed: fullQuiz.groundingQueriesUsed || [],
    };
    job.questions = fullQuiz.questions;
    job.status = 'completed';
    await checkpoint(job);
    onProgress?.(job.questions.length, job.config.questionCount);
    return job.quiz;
  } catch (error) {
    if (signal.aborted) {
      job.status = 'cancelled';
      await checkpoint(job);
      throw error;
    }
    const classified = classifyApiError(error, job.preferences.model);
    const status = classified.code?.startsWith('QUALITY_') ? 'available' : keyStatus(classified);
    await repository.recordKeyOutcome(key.id, status);
    job.status = 'failed';
    await checkpoint(job);
    throw classified;
  }
}

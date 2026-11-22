import { normalizeQuizConfig } from '../quizConfig.js';
import { localCredential } from './localRepository.js';
import { supabase, SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';
import { keyPaused, keyStatus, quotaPauseUntil, availableKeys, type ApiKeyRecord, type GenerationJob, type Preferences, type WorkspaceRepository } from './types.js';
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

async function consumeAccountStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
  expectedOwner: string,
  onProgress?: (count: number) => void
): Promise<{ quiz: Quiz; complete: boolean } | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Sesi berakhir. Masuk kembali untuk melanjutkan.');
  if (expectedOwner && session.session.user.id !== expectedOwner) throw new Error('Identitas akun berubah. Operasi dihentikan.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/quiz-ai`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.session.access_token}`
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    let result: any;
    try { result = await response.json(); } catch { throw new Error('Layanan AI akun belum merespons. Data lokal tidak digunakan sebagai cadangan.'); }
    if (!response.ok) throw Object.assign(new Error(result.error || 'Layanan AI akun belum tersedia.'), { status: response.status, code: result.code });
    return result;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let finalResult: { quiz: Quiz; complete: boolean } | null = null;
  let streamError: Error | null = null;

  const processBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = currentEvent;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let payload: any;
    try { payload = JSON.parse(dataLines.join('\n')); } catch { return; }
    if (eventName === 'progress' && Number.isInteger(payload?.receivedQuestionCount) && payload.receivedQuestionCount > 0) {
      onProgress?.(payload.receivedQuestionCount);
    } else if (eventName === 'complete' && payload?.quiz) {
      finalResult = { quiz: payload.quiz, complete: true };
    } else if (eventName === 'error') {
      streamError = Object.assign(new Error(payload?.error || 'Operasi pembuatan kuis di server belum berhasil.'), {
        code: payload?.code || 'GENERATION_FAILED',
        status: payload?.status || 502,
      });
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        processBlock(block);
        if (streamError) throw streamError;
        if (finalResult) return finalResult;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      processBlock(buffer);
      if (streamError) throw streamError;
    }
  } finally {
    reader.releaseLock();
  }
  return finalResult;
}

export async function testKey(repository: WorkspaceRepository, id: string, model: Preferences['model']) {
  if (repository.scope !== 'guest') return invokeAccount({ action: 'test', keyId: id, model }, undefined, repository.scope);
  const record = (await repository.keys()).find(k => k.id === id && k.enabled && !keyPaused(k));
  if (!record) throw new Error('Key aktif tidak ditemukan atau sedang dijeda.');
  try {
    if (record.provider === 'parallel') {
      await guestParallelSearch('Penjumlahan sederhana', await localCredential(id));
      await repository.recordKeyOutcome(id, 'available'); return;
    }
    const { generateQuizBatch } = await import('../server/geminiService.js');
    // Fast probe: uses the model's lowest supported thinking level and small token cap.
    await generateQuizBatch(
      { model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false },
      await localCredential(id),
      [],
      undefined,
      undefined,
      undefined,
      { purpose: 'probe', timeoutMs: 25000 }
    );
    await repository.recordKeyOutcome(id, 'available');
  } catch (e) { await repository.recordKeyOutcome(id, keyStatus(e), quotaPauseUntil(e)); throw e; }
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
  const config = normalizeQuizConfig({
    ...input,
    model: preferences.model,
    enableGrounding: preferences.grounding,
    ...(preferences.effort !== undefined ? { effort: preferences.effort } : {}),
  });
  let job: GenerationJob = resume ? structuredClone(resume) : { id: crypto.randomUUID(), config, preferences: { ...structuredClone(preferences), grounding: config.enableGrounding ?? preferences.grounding },
    questions: [], status: 'running', createdAt: new Date().toISOString() };
  job.config = normalizeQuizConfig(job.config);

  if (job.status === 'completed' && job.quiz) {
    onProgress?.(job.questions.length, job.config.questionCount);
    return job.quiz;
  }
  if (job.modelCallCount && job.modelCallCount > 0) {
    throw new Error('Operasi ini telah dikonsumsi hak pengirimannya ke model AI.');
  }

  job.status = 'running';
  const eligible = availableKeys(keys, job.preferences);
  if (!eligible.length) throw new Error('Tambahkan atau aktifkan API key pada ruang penyimpanan ini.');
  if (job.preferences.grounding && job.preferences.searchProvider === 'parallel' && repository.scope === 'guest') {
    const searchKey = keys.find(k => k.provider === 'parallel' && k.enabled && !keyPaused(k));
    if (!searchKey) throw new Error('Tambahkan atau aktifkan satu API key Parallel pada Pengaturan AI.');
    if (!usableResearch(job.parallelResearch, job.config.topic, job.config)) {
      await checkpoint(job);
      try {
        job.parallelResearch = await guestParallelSearch(job.config.topic, await localCredential(searchKey.id), signal, job.config);
        await repository.recordKeyOutcome(searchKey.id, 'available');
      } catch (error) {
        if (signal.aborted) throw error;
        await repository.recordKeyOutcome(searchKey.id, keyStatus(error), quotaPauseUntil(error));
        throw error;
      }
    }
  }

  signal.throwIfAborted();
  if (repository.scope !== 'guest') {
    await checkpoint(job);
    let result: any;
    const pollUntilComplete = async (startTime = Date.now()) => {
      const maxWaitMs = 180000;
      let consecutiveNetworkErrors = 0;
      let pollCount = 0;
      while (true) {
        signal.throwIfAborted();
        if (Date.now() - startTime > maxWaitMs) {
          throw new Error('Waktu tunggu pembuatan kuis habis (180 detik). Silakan coba lagi.');
        }
        const delayMs = pollCount < 4 ? 1200 + Math.random() * 300 : 2200 + Math.random() * 400;
        pollCount++;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason || new DOMException('Operasi dibatalkan', 'AbortError'));
          }, { once: true });
        });
        signal.throwIfAborted();

        let pollRes: any;
        try {
          pollRes = await invokeAccount(
            { action: 'status', operationId: job.id },
            signal,
            repository.scope
          );
          consecutiveNetworkErrors = 0;
        } catch (pollErr: any) {
          if (signal.aborted || pollErr?.name === 'AbortError') throw pollErr;
          const isTransientPollError = !pollErr?.status || [408, 500, 502, 503, 504].includes(Number(pollErr.status));
          if (isTransientPollError && ++consecutiveNetworkErrors <= 3) {
            continue;
          }
          throw pollErr;
        }

        if (Number.isInteger(pollRes.receivedQuestionCount) && pollRes.receivedQuestionCount > 0) {
          onProgress?.(Math.min(pollRes.receivedQuestionCount, job.config.questionCount), job.config.questionCount);
        }

        if (pollRes.complete && pollRes.quiz) {
          return pollRes;
        }
        if (pollRes.error || ['failed_after_dispatch', 'failed_preflight', 'failed'].includes(pollRes.status)) {
          throw Object.assign(new Error(pollRes.error || 'Operasi pembuatan kuis di server belum berhasil.'), {
            code: pollRes.code || 'GENERATION_FAILED',
            status: pollRes.statusCode || 502
          });
        }
        if (pollRes.status === 'cancelled') {
          throw Object.assign(new Error('Pembuatan kuis dibatalkan.'), { code: 'CANCELLED', status: 409 });
        }
      }
    };

    try {
      const streamStarted = Date.now();
      try {
        const streamed = await consumeAccountStream(
          { action: 'stream', operationId: job.id, config: job.config, preferences: job.preferences },
          signal,
          repository.scope,
          count => onProgress?.(Math.min(count, job.config.questionCount), job.config.questionCount)
        );
        if (streamed?.complete && streamed.quiz) {
          result = streamed;
        } else {
          result = await pollUntilComplete(streamStarted);
        }
      } catch (streamErr: any) {
        if (signal.aborted || streamErr?.name === 'AbortError') throw streamErr;
        if (streamErr?.status === 400 && String(streamErr.message).includes('Operasi tidak valid')) {
          const startRes = await invokeAccount(
            { action: 'start', operationId: job.id, config: job.config, preferences: job.preferences },
            signal,
            repository.scope
          );
          result = (startRes.complete && startRes.quiz) ? startRes : await pollUntilComplete(streamStarted);
        } else if (!streamErr?.status || [502, 504].includes(Number(streamErr.status)) && !streamErr?.code) {
          // Connection dropped mid-stream; check background status before failing
          result = await pollUntilComplete(streamStarted);
        } else {
          throw streamErr;
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
      job.config,
      await localCredential(key.id), [], signal,
      job.preferences.grounding && job.preferences.searchProvider === 'parallel' ? job.parallelResearch : undefined,
      undefined,
      {
        stream: true,
        effort: job.preferences.effort,
        onProgress: count => onProgress?.(Math.min(count, job.config.questionCount), job.config.questionCount),
      }
    );
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
    await repository.recordKeyOutcome(key.id, status, quotaPauseUntil(classified));
    job.status = 'failed';
    await checkpoint(job);
    throw classified;
  }
}

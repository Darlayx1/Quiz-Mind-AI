// @ts-nocheck -- Deno Edge runtime; bundled independently from the Vite application.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateQuizBatch, classifyApiError } from '../_shared/quiz-engine.ts';
import { evaluateSingleCall, evaluationTimeoutsForEffort } from '../_shared/evaluation-engine.ts';

import { searchParallel, usableResearch } from '../../../src/server/parallelSearch.ts';
import { normalizeQuizConfig } from '../../../src/quizConfig.ts';
import { normalizeEffort } from '../../../src/models.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const sseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const url = Deno.env.get('SUPABASE_URL');
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

const statusOf = error => {
  const status = Number(error.status);
  return status === 401 || status === 403 ? 'invalid' : status === 429 ? 'quota' : 'unavailable';
};

async function outcome(id, userId, status) {
  const { error } = await admin.rpc('qm_record_outcome', { p_user: userId, p_key: id, p_status: status });
  if (error) throw new Error('Status key belum berhasil disimpan.');
}

function watchGenerationCancellation(job, userId, requestSignal, isBackground = false) {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException('Pembuatan kuis dibatalkan.', 'AbortError'));
  if (!isBackground && requestSignal) {
    requestSignal.addEventListener('abort', abort, { once: true });
    if (requestSignal.aborted) abort();
  }
  let checking = false;
  const timer = setInterval(async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const { data, error } = await admin.from('qm_ai_jobs').select('status,lease_token').eq('id', job.id).eq('user_id', userId).single();
      if (!error && (data?.status === 'cancelled' || data?.lease_token !== job.lease_token)) abort();
    } catch { /* Transient read failure must not abort */ }
    finally { checking = false; }
  }, 2000);
  return {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(145000)]),
    stop() {
      clearInterval(timer);
      if (!isBackground && requestSignal) {
        requestSignal.removeEventListener('abort', abort);
      }
    }
  };
}

function isKeyEligible(k, now = Date.now()) {
  if (k.status !== 'quota') return true;
  if (k.paused_until && Number.isFinite(Date.parse(k.paused_until))) {
    return Date.parse(k.paused_until) <= now;
  }
  return !(k.tested_at && Date.parse(k.tested_at) + 86400000 > now);
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  let job;
  let userId;
  try {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Masuk untuk menggunakan data akun.' }, 401);
    const { data: identity, error: authError } = await admin.auth.getUser(token);
    if (authError || !identity.user) return json({ error: 'Sesi tidak valid. Masuk kembali.' }, 401);
    userId = identity.user.id;

    const raw = await request.text();
    if (raw.length > 2000000) return json({ error: 'Permintaan terlalu besar.' }, 413);
    const body = JSON.parse(raw);

    if (body.action === 'status') {
      if (!/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
      const { data: jobRow, error: pollError } = await admin.from('qm_ai_jobs').select('id,status,phase,cursor,policy_version,lease_until,result').eq('id', body.operationId).eq('user_id', userId).single();
      if (pollError || !jobRow) return json({ error: 'Operasi tidak ditemukan.' }, 404);
      const leaseExpired = jobRow.status === 'running' && jobRow.lease_until && Number.isFinite(Date.parse(jobRow.lease_until)) && Date.parse(jobRow.lease_until) < Date.now();
      const effectiveStatus = leaseExpired ? 'failed_after_dispatch' : jobRow.status;
      return json({
        id: jobRow.id,
        status: effectiveStatus,
        phase: leaseExpired ? 'failed_after_dispatch' : jobRow.phase,
        receivedQuestionCount: jobRow.cursor || 0,
        policyVersion: jobRow.policy_version,
        complete: effectiveStatus === 'completed',
        quiz: effectiveStatus === 'completed' ? jobRow.result : undefined,
        error: ['failed_after_dispatch', 'failed_preflight', 'failed'].includes(effectiveStatus)
          ? (jobRow.result?.error || (leaseExpired ? 'Operasi melewati batas waktu pemrosesan server. Silakan coba kembali.' : 'Operasi gagal.'))
          : undefined,
        code: jobRow.result?.code || (leaseExpired ? 'TIMEOUT' : undefined),
        statusCode: jobRow.result?.statusCode || (leaseExpired ? 504 : undefined)
      });
    }

    if (body.action === 'cancel') {
      if (!/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
      await admin.rpc('qm_cancel_job', { p_id: body.operationId });
      return json({ success: true, status: 'cancelled' });
    }

    const loadKeys = async () => {
      const { data, error } = await admin.from('qm_api_keys').select('*').eq('user_id', userId).eq('enabled', true).order('priority').order('id');
      if (error) throw new Error('Penyimpanan akun belum siap.');
      return data.filter(k => isKeyEligible(k));
    };

    const getSecret = async key => {
      const { data, error } = await admin.rpc('qm_service_credential', { p_user: userId, p_key: key.id });
      if (error || !data) throw new Error('Key tidak tersedia pada akun ini.');
      return data;
    };

    if (body.action === 'test') {
      const keys = await loadKeys();
      const key = keys.find(k => k.id === body.keyId);
      if (!key) return json({ error: 'Key aktif tidak ditemukan pada akun ini.' }, 404);
      try {
        if (key.provider === 'parallel') await searchParallel('Penjumlahan sederhana', await getSecret(key), request.signal);
        else await generateQuizBatch({ model: body.model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false }, await getSecret(key), [], request.signal, undefined, undefined, { purpose: 'probe', timeoutMs: 25000 });
        await outcome(key.id, userId, 'available');
        return json({ success: true });
      } catch (error) {
        const classified = classifyApiError(error, body.model);
        await outcome(key.id, userId, statusOf(classified));
        throw classified;
      }
    }

    if (body.action === 'evaluate') {
      const keys = await loadKeys();
      const key = keys.find(k => k.id === body.keyId && k.provider !== 'parallel');
      if (!key) return json({ error: 'Key aktif tidak tersedia pada akun ini.' }, 404);
      const { data: workspace, error } = await admin.from('qm_workspaces').select('data').eq('user_id', userId).single();
      const stored = workspace?.data?.history?.find(h => h.quiz.id === body.input?.quiz?.id)?.lastResult;
      if (error || !stored || stored.submission.completedAt !== body.input?.submission?.completedAt) return json({ error: 'Jawaban belum tersimpan pada akun aktif.' }, 409);
      try {
        const effort = normalizeEffort(body.effort ?? body.input?.settings?.effort ?? stored.quiz?.evaluationSettings?.effort, body.model);
        const { timeoutMs } = evaluationTimeoutsForEffort(effort, body.model);
        const evaluations = await evaluateSingleCall(
          { ...body.input, settings: { ...(body.input?.settings || {}), effort }, quiz: stored.quiz, submission: stored.submission },
          await getSecret(key),
          body.model,
          AbortSignal.timeout(timeoutMs)
        );
        await outcome(key.id, userId, 'available');
        return json({ evaluations });
      } catch (error) {
        const classified = classifyApiError(error, body.model);
        await outcome(key.id, userId, statusOf(classified));
        throw classified;
      }
    }

    if (!['generate', 'start', 'stream'].includes(body.action) || !/^[0-9a-f-]{36}$/i.test(body.operationId)) {
      return json({ error: 'Operasi tidak valid.' }, 400);
    }

    const preferences = body.preferences;
    if (!body.config || !Number.isInteger(body.config.questionCount) || body.config.questionCount < 1 || body.config.questionCount > 100) {
      return json({ error: 'Jumlah soal harus 1–100.' }, 400);
    }
    if (preferences?.searchProvider && !['google', 'parallel'].includes(preferences.searchProvider)) {
      return json({ error: 'Penyedia pencarian tidak valid.' }, 400);
    }

    // Parallelize key lookup and job claim to save a database roundtrip
    const [keys, claimResponse] = await Promise.all([
      loadKeys(),
      admin.rpc('qm_claim_job', {
        p_user: userId,
        p_id: body.operationId,
        p_config: body.config,
        p_preferences: preferences ?? {}
      })
    ]);
    const { data: claimed, error: claimError } = claimResponse;
    if (claimError) {
      return json(
        { error: claimError.code === '55P03' ? 'Operasi masih diproses atau telah dikirim sebelumnya.' : claimError.message },
        claimError.code === '55P03' ? 409 : 400
      );
    }
    job = claimed;
    if (job.status === 'completed') return json({ quiz: job.result, complete: true });
    if (job.dispatch_reserved_at || (job.model_call_count && job.model_call_count > 0)) {
      return json({ error: 'Operasi sudah pernah dikirim ke model AI.', code: 'DISPATCH_ALREADY_RESERVED' }, 409);
    }

    const generationKeys = keys.filter(k => k.provider !== 'parallel');
    if (preferences?.keyId && keys.some(k => k.id === preferences.keyId && k.provider === 'parallel')) {
      throw Object.assign(new Error('Key Parallel hanya dapat digunakan untuk pencarian web.'), { status: 400 });
    }
    const selectedKey = generationKeys.find(k => k.id === preferences?.keyId) || generationKeys[0];
    if (!selectedKey) throw Object.assign(new Error('Tambahkan API key aktif pada akun ini.'), { status: 400 });

    const fullConfig = normalizeQuizConfig({
      ...body.config,
      model: preferences?.model,
      enableGrounding: preferences?.grounding,
      ...(preferences?.effort !== undefined ? { effort: preferences.effort } : {})
    });

    const executeGeneration = async (isBackground = false, onStreamEvent = undefined) => {
      const cancellation = watchGenerationCancellation(job, userId, request.signal, isBackground);
      try {
        let research = job.result?.parallelResearch;

        if (fullConfig.enableGrounding && preferences?.searchProvider === 'parallel') {
          const searchKey = keys.find(k => k.provider === 'parallel');
          if (!searchKey) throw Object.assign(new Error('Tambahkan atau aktifkan satu API key Parallel pada akun ini.'), { status: 400, code: 'PARALLEL_KEY_MISSING' });
          if (!usableResearch(research, fullConfig.topic, fullConfig)) {
            onStreamEvent?.('phase', { phase: 'researching' });
            try {
              research = await searchParallel(fullConfig.topic, await getSecret(searchKey), cancellation.signal, fullConfig);
              await outcome(searchKey.id, userId, 'available');
            } catch (error) {
              cancellation.signal.throwIfAborted();
              await outcome(searchKey.id, userId, statusOf(error));
              throw error;
            }
            if (research) {
              job.result = { ...(job.result || {}), questions: [], parallelResearch: research };
              await admin.rpc('qm_checkpoint_research', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_research: research });
            }
          }
        }

        cancellation.signal.throwIfAborted();

        // Parallelize atomic dispatch reservation and credential retrieval
        const [reserveRes, secret] = await Promise.all([
          admin.rpc('qm_reserve_dispatch', {
            p_user: userId,
            p_id: job.id,
            p_lease: job.lease_token
          }),
          getSecret(selectedKey)
        ]);
        if (reserveRes.error || !reserveRes.data) {
          throw Object.assign(new Error('Hak pengiriman model AI untuk operasi ini telah dikonsumsi.'), { status: 409, code: 'DISPATCH_ALREADY_RESERVED' });
        }
        job.dispatch_reserved_at = new Date().toISOString();
        job.model_call_count = 1;

        cancellation.signal.throwIfAborted();
        onStreamEvent?.('phase', { phase: 'generating' });

        // Coalesce progress writes without blocking token reception. Progress is
        // advisory; only the final atomic commit publishes a validated quiz.
        let latestProgress = 0;
        let progressWrite;
        const onProgress = count => {
          latestProgress = Math.min(count, fullConfig.questionCount);
          onStreamEvent?.('progress', { receivedQuestionCount: latestProgress, total: fullConfig.questionCount });
          if (progressWrite) return;
          progressWrite = (async () => {
            let saved = 0;
            while (saved < latestProgress && !cancellation.signal.aborted) {
              saved = latestProgress;
              const { error } = await admin.from('qm_ai_jobs').update({ cursor: saved, phase: 'receiving' })
                .eq('id', job.id).eq('user_id', userId).eq('lease_token', job.lease_token).eq('status', 'running');
              if (error) return;
            }
          })().catch(() => { /* A progress write failure must not discard valid output. */ })
            .finally(() => { progressWrite = undefined; });
        };
        let quiz;
        try {
          quiz = await generateQuizBatch(
            fullConfig,
            secret,
            [],
            cancellation.signal,
            research,
            undefined,
            { stream: true, onProgress, effort: fullConfig.effort }
          );
          await outcome(selectedKey.id, userId, 'available');
        } catch (error) {
          if (cancellation.signal.aborted) {
            if (cancellation.signal.reason?.name === 'TimeoutError') throw classifyApiError(cancellation.signal.reason, preferences?.model);
            cancellation.signal.throwIfAborted();
          }
          const classified = classifyApiError(error, preferences?.model);
          await outcome(selectedKey.id, userId, statusOf(classified));
          throw classified;
        }

        cancellation.signal.throwIfAborted();
        quiz.id = job.id;

        const { error: commitError } = await admin.rpc('qm_commit_job', {
          p_user: userId,
          p_id: job.id,
          p_lease: job.lease_token,
          p_result: quiz,
          p_status: 'completed'
        });
        if (commitError) throw new Error('Operasi berubah atau dibatalkan. Hasil kuis tidak dapat disimpan.');

        onStreamEvent?.('complete', { quiz, complete: true });
        return json({ quiz, complete: true });
      } catch (error) {
        const timedOut = cancellation.signal.aborted && cancellation.signal.reason?.name === 'TimeoutError';
        if (timedOut) error = classifyApiError(cancellation.signal.reason, preferences?.model);
        if (job && userId) {
          const isReserved = Boolean(job.dispatch_reserved_at || (job.model_call_count && job.model_call_count > 0));
          const targetStatus = !timedOut && (error?.name === 'AbortError' || cancellation.signal.aborted)
            ? 'cancelled'
            : (isReserved ? 'failed_after_dispatch' : 'failed_preflight');
          try {
            await admin.rpc('qm_commit_job', {
              p_user: userId,
              p_id: job.id,
              p_lease: job.lease_token,
              p_result: { ...(job.result || {}), error: error?.message || 'Operasi gagal.', code: error?.code, statusCode: error?.status },
              p_status: targetStatus
            });
          } catch { /* Best effort commit */ }
        }
        throw error;
      } finally {
        cancellation.stop();
      }
    };

    if (body.action === 'stream') {
      const encoder = new TextEncoder();
      const hasWaitUntil = typeof globalThis.EdgeRuntime?.waitUntil === 'function';
      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          const send = (event, payload) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
            } catch {
              closed = true;
            }
          };
          const heartbeat = setInterval(() => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            } catch {
              closed = true;
            }
          }, 5000);
          const task = executeGeneration(hasWaitUntil, send)
            .catch(err => {
              const cancelled = err?.name === 'AbortError';
              const status = cancelled ? 409 : (Number(err?.status) >= 400 && Number(err?.status) <= 599 ? Number(err.status) : 502);
              const code = cancelled ? 'CANCELLED' : (err?.code || 'ACCOUNT_REQUEST_FAILED');
              send('error', { error: cancelled ? 'Pembuatan kuis dibatalkan.' : (err?.message || 'Operasi AI belum berhasil.'), code, status });
            })
            .finally(() => {
              clearInterval(heartbeat);
              if (!closed) {
                closed = true;
                try { controller.close(); } catch { /* stream already closed */ }
              }
            });
          if (hasWaitUntil) {
            globalThis.EdgeRuntime.waitUntil(task);
          }
        }
      });
      return new Response(stream, { status: 200, headers: sseHeaders });
    }

    if (body.action === 'start' && typeof globalThis.EdgeRuntime?.waitUntil === 'function') {
      globalThis.EdgeRuntime.waitUntil(
        executeGeneration(true).catch(err => {
          console.warn(JSON.stringify({ event: 'background-generation-failed', error: err?.message || String(err) }));
        })
      );
      return json({ operationId: job.id, policyVersion: 'single-call-high-v1', status: 'accepted' }, 202);
    }

    return await executeGeneration(false);

  } catch (error) {
    if (job && userId) {
      const isReserved = Boolean(job.dispatch_reserved_at || (job.model_call_count && job.model_call_count > 0));
      const targetStatus = error?.name === 'AbortError' || request.signal.aborted
        ? 'cancelled'
        : (isReserved ? 'failed_after_dispatch' : 'failed_preflight');
      try {
        await admin.rpc('qm_commit_job', {
          p_user: userId,
          p_id: job.id,
          p_lease: job.lease_token,
          p_result: { ...(job.result || {}), error: error?.message || 'Operasi gagal.', code: error?.code, statusCode: error?.status },
          p_status: targetStatus
        });
      } catch { /* Best effort commit */ }
    }
    if (error?.name === 'AbortError' || request.signal.aborted) {
      return json({ error: 'Pembuatan kuis dibatalkan.', code: 'CANCELLED' }, 409);
    }
    const status = Number(error.status);
    const code = error.code || 'ACCOUNT_REQUEST_FAILED';
    console.warn(JSON.stringify({ event: 'quiz-ai-failure', status: status >= 400 && status <= 599 ? status : 502, code }));
    return json({ error: error.message || 'Operasi AI belum berhasil.', code }, status >= 400 && status <= 599 ? status : 502);
  }
});

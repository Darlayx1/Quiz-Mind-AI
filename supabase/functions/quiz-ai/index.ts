// @ts-nocheck -- Deno Edge runtime; bundled independently from the Vite application.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateQuizBatch, classifyApiError } from '../_shared/quiz-engine.ts';
import { evaluateSingleCall } from '../_shared/evaluation-engine.ts';

import { searchParallel, usableResearch } from '../../../src/server/parallelSearch.ts';
import { stableResearchFallbackCodes } from '../../../src/server/assessmentPolicy.ts';
import { normalizeQuizConfig } from '../../../src/quizConfig.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
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

function watchGenerationCancellation(job, userId, requestSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException('Pembuatan kuis dibatalkan.', 'AbortError'));
  requestSignal.addEventListener('abort', abort, { once: true });
  if (requestSignal.aborted) abort();
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
    stop() { clearInterval(timer); requestSignal.removeEventListener('abort', abort); }
  };
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

    const { data: keys, error: keysError } = await admin.from('qm_api_keys').select('*').eq('user_id', userId).eq('enabled', true).order('priority').order('id');
    if (keysError) throw new Error('Penyimpanan akun belum siap.');
    const getSecret = async key => {
      const { data, error } = await admin.rpc('qm_service_credential', { p_user: userId, p_key: key.id });
      if (error || !data) throw new Error('Key tidak tersedia pada akun ini.');
      return data;
    };

    if (body.action === 'test') {
      const key = keys.find(k => k.id === body.keyId);
      if (!key) return json({ error: 'Key aktif tidak ditemukan pada akun ini.' }, 404);
      try {
        if (key.provider === 'parallel') await searchParallel('Penjumlahan sederhana', await getSecret(key), request.signal);
        else await generateQuizBatch({ model: body.model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false }, await getSecret(key), [], request.signal);
        await outcome(key.id, userId, 'available');
        return json({ success: true });
      } catch (error) {
        const classified = classifyApiError(error, body.model);
        await outcome(key.id, userId, statusOf(classified));
        throw classified;
      }
    }

    if (body.action === 'evaluate') {
      const key = keys.find(k => k.id === body.keyId && k.provider !== 'parallel');
      if (!key) return json({ error: 'Key aktif tidak tersedia pada akun ini.' }, 404);
      const { data: workspace, error } = await admin.from('qm_workspaces').select('data').eq('user_id', userId).single();
      const stored = workspace?.data?.history?.find(h => h.quiz.id === body.input?.quiz?.id)?.lastResult;
      if (error || !stored || stored.submission.completedAt !== body.input?.submission?.completedAt) return json({ error: 'Jawaban belum tersimpan pada akun aktif.' }, 409);
      try {
        const evaluations = await evaluateSingleCall({ ...body.input, quiz: stored.quiz, submission: stored.submission }, await getSecret(key), body.model, AbortSignal.timeout(45000));
        await outcome(key.id, userId, 'available');
        return json({ evaluations });
      } catch (error) {
        const classified = classifyApiError(error, body.model);
        await outcome(key.id, userId, statusOf(classified));
        throw classified;
      }
    }

    if (body.action === 'status') {
      if (!/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
      const { data: jobRow, error: pollError } = await admin.from('qm_ai_jobs').select('*').eq('id', body.operationId).eq('user_id', userId).single();
      if (pollError || !jobRow) return json({ error: 'Operasi tidak ditemukan.' }, 404);
      return json({
        id: jobRow.id,
        status: jobRow.status,
        phase: jobRow.phase,
        policyVersion: jobRow.policy_version,
        complete: jobRow.status === 'completed',
        quiz: jobRow.status === 'completed' ? jobRow.result : undefined,
        error: ['failed_after_dispatch', 'failed_preflight', 'failed'].includes(jobRow.status) ? (jobRow.result?.error || 'Operasi gagal.') : undefined
      });
    }

    if (body.action === 'cancel') {
      if (!/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
      await admin.rpc('qm_cancel_job', { p_id: body.operationId });
      return json({ success: true, status: 'cancelled' });
    }

    if (!['generate', 'start'].includes(body.action) || !/^[0-9a-f-]{36}$/i.test(body.operationId)) {
      return json({ error: 'Operasi tidak valid.' }, 400);
    }

    const preferences = body.preferences;
    if (!body.config || !Number.isInteger(body.config.questionCount) || body.config.questionCount < 1 || body.config.questionCount > 100) {
      return json({ error: 'Jumlah soal harus 1–100.' }, 400);
    }
    if (preferences?.searchProvider && !['google', 'parallel'].includes(preferences.searchProvider)) {
      return json({ error: 'Penyedia pencarian tidak valid.' }, 400);
    }

    const { data: claimed, error: claimError } = await admin.rpc('qm_claim_job', {
      p_user: userId,
      p_id: body.operationId,
      p_config: body.config,
      p_preferences: preferences ?? {}
    });
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
    const selectedKey = preferences?.keyId ? generationKeys.find(k => k.id === preferences.keyId) : generationKeys[0];
    if (!selectedKey) throw Object.assign(new Error('Tambahkan API key aktif pada akun ini.'), { status: 400 });

    const fullConfig = normalizeQuizConfig({ ...body.config, model: preferences?.model, enableGrounding: preferences?.grounding });

    const executeGeneration = async () => {
      const cancellation = watchGenerationCancellation(job, userId, request.signal);
      try {
        let research = job.result?.parallelResearch;
        const generationState = job.result?.generationState || {};

        if (preferences?.grounding && preferences?.searchProvider === 'parallel') {
          const searchKey = keys.find(k => k.provider === 'parallel');
          if (!searchKey) throw Object.assign(new Error('Tambahkan atau aktifkan satu API key Parallel pada akun ini.'), { status: 400, code: 'PARALLEL_KEY_MISSING' });
          if (!generationState.parallelFallback && !usableResearch(research, fullConfig.topic, fullConfig)) {
            try {
              research = await searchParallel(fullConfig.topic, await getSecret(searchKey), cancellation.signal, fullConfig);
              await outcome(searchKey.id, userId, 'available');
            } catch (error) {
              cancellation.signal.throwIfAborted();
              if (stableResearchFallbackCodes.includes(error.code)) {
                generationState.parallelFallback = error.code;
                research = undefined;
                await outcome(searchKey.id, userId, 'available');
              } else {
                await outcome(searchKey.id, userId, statusOf(error));
                throw error;
              }
            }
            if (research) {
              job.result = { ...(job.result || {}), questions: [], parallelResearch: research };
              await admin.rpc('qm_checkpoint_research', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_research: research });
            }
          }
        }

        cancellation.signal.throwIfAborted();

        // Atomic dispatch reservation: consumed ONCE before socket connection
        const { data: reserved, error: reserveErr } = await admin.rpc('qm_reserve_dispatch', {
          p_user: userId,
          p_id: job.id,
          p_lease: job.lease_token
        });
        if (reserveErr || !reserved) {
          throw Object.assign(new Error('Hak pengiriman model AI untuk operasi ini telah dikonsumsi.'), { status: 409, code: 'DISPATCH_ALREADY_RESERVED' });
        }
        job.dispatch_reserved_at = new Date().toISOString();
        job.model_call_count = 1;

        cancellation.signal.throwIfAborted();

        // Exactly one model call for the entire quiz with high reasoning
        let quiz;
        try {
          quiz = await generateQuizBatch(
            { ...fullConfig, enableGrounding: generationState.parallelFallback ? false : preferences?.grounding },
            await getSecret(selectedKey),
            [],
            cancellation.signal,
            generationState.parallelFallback ? undefined : research
          );
          if (generationState.parallelFallback) {
            quiz.groundingFallbackUsed = true;
            quiz.generationWarnings = [...(quiz.generationWarnings || []), 'Referensi web tidak tersedia. Kuis dibuat tanpa referensi web; informasi terbaru belum diverifikasi.'];
          }
          await outcome(selectedKey.id, userId, 'available');
        } catch (error) {
          cancellation.signal.throwIfAborted();
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

        return json({ quiz, complete: true });
      } finally {
        cancellation.stop();
      }
    };

    if (body.action === 'start' && typeof globalThis.EdgeRuntime?.waitUntil === 'function') {
      globalThis.EdgeRuntime.waitUntil(executeGeneration());
      return json({ operationId: job.id, policyVersion: 'single-call-high-v1', status: 'accepted' }, 202);
    }

    return await executeGeneration();

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
          p_result: { ...(job.result || {}), error: error?.message || 'Operasi gagal.' },
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

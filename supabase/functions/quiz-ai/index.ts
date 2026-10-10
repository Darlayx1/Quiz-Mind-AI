// @ts-nocheck -- Deno Edge runtime; bundled independently from the Vite application.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateQuizBatch, classifyApiError, nextQuizBatch, isRetryableGenerationError } from '../_shared/quiz-engine.ts';
import { evaluateSingleCall } from '../_shared/evaluation-engine.ts';

import { searchParallel, usableResearch } from '../../../src/server/parallelSearch.ts';
import { recordGenerationFailure, needsCurrentEvidence, stableResearchFallbackCodes } from '../../../src/server/assessmentPolicy.ts';
import { normalizeQuizConfig } from '../../../src/quizConfig.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const url = Deno.env.get('SUPABASE_URL');
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const statusOf = error => {
  const status = Number(error.status); return status === 401 || status === 403 ? 'invalid' : status === 429 ? 'quota' : 'unavailable';
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
    } catch { /* A transient database read failure must not override the active request. */ }
    finally { checking = false; }
  }, 2000);
  return { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(165000)]), stop() { clearInterval(timer); requestSignal.removeEventListener('abort', abort); } };
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
    const raw = await request.text(); if (raw.length > 2000000) return json({ error: 'Permintaan terlalu besar.' }, 413);
    const body = JSON.parse(raw);
    const { data: keys, error: keysError } = await admin.from('qm_api_keys').select('*').eq('user_id', userId).eq('enabled', true).order('priority').order('id');
    if (keysError) throw new Error('Penyimpanan akun belum siap.');
    const getSecret = async key => {
      const { data, error } = await admin.rpc('qm_service_credential', { p_user: userId, p_key: key.id });
      if (error || !data) throw new Error('Key tidak tersedia pada akun ini.'); return data;
    };
    if (body.action === 'test') {
      const key = keys.find(k => k.id === body.keyId); if (!key) return json({ error: 'Key aktif tidak ditemukan pada akun ini.' }, 404);
      try {
        if (key.provider === 'parallel') await searchParallel('Penjumlahan sederhana', await getSecret(key), request.signal);
        else await generateQuizBatch({ model: body.model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false }, await getSecret(key), [], request.signal);
        await outcome(key.id, userId, 'available'); return json({ success: true });
      } catch (error) { const classified = classifyApiError(error, body.model); await outcome(key.id, userId, statusOf(classified)); throw classified; }
    }
    if (body.action === 'evaluate') {
      const key=keys.find(k=>k.id===body.keyId && k.provider !== 'parallel'); if(!key)return json({error:'Key aktif tidak tersedia pada akun ini.'},404);
      const {data: workspace,error}=await admin.from('qm_workspaces').select('data').eq('user_id',userId).single();
      const stored=workspace?.data?.history?.find(h=>h.quiz.id===body.input?.quiz?.id)?.lastResult;
      if(error||!stored||stored.submission.completedAt!==body.input?.submission?.completedAt)return json({error:'Jawaban belum tersimpan pada akun aktif.'},409);
      try{
        const evaluations=await evaluateSingleCall({...body.input,quiz:stored.quiz,submission:stored.submission},await getSecret(key),body.model,AbortSignal.timeout(45000));
        await outcome(key.id,userId,'available');return json({evaluations});
      }catch(error){const classified=classifyApiError(error,body.model);await outcome(key.id,userId,statusOf(classified));throw classified;}
    }
    if (body.action !== 'generate' || !/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
    const preferences = body.preferences;
    if (!body.config || !Number.isInteger(body.config.questionCount) || body.config.questionCount < 1 || body.config.questionCount > 100) return json({ error: 'Jumlah soal harus 1–100.' }, 400);
    if (!preferences || !Number.isInteger(preferences.maxAttempts) || preferences.maxAttempts < 1 || preferences.maxAttempts > 3) return json({ error: 'Batas percobaan tidak valid.' }, 400);
    if (preferences.searchProvider && !['google', 'parallel'].includes(preferences.searchProvider)) return json({ error: 'Penyedia pencarian tidak valid.' }, 400);
    const { data: claimed, error: claimError } = await admin.rpc('qm_claim_job', { p_user: userId, p_id: body.operationId, p_config: body.config, p_preferences: preferences });
    if (claimError) return json({ error: claimError.code === '55P03' ? 'Batch masih diproses. Tunggu sebelum melanjutkan.' : claimError.message }, claimError.code === '55P03' ? 409 : 400);
    job = claimed;
    if (preferences.grounding && job.result?.groundingFallbackUsed && !job.result?.generationState?.parallelFallback) throw Object.assign(new Error('Kuis sebelumnya dibuat tanpa web. Buat kuis baru agar seluruh soal memakai pencarian web.'), { status: 409, code: 'WEB_RESTART_REQUIRED' });
    if (job.status === 'completed') return json({ quiz: job.result, complete: true });
    const generationKeys = keys.filter(k => k.provider !== 'parallel');
    const selected = preferences.keyId ? generationKeys.find(k => k.id === preferences.keyId) : null;
    const candidates = preferences.keyId ? selected ? [selected, ...(preferences.fallback ? generationKeys.filter(k => k.id !== selected.id) : [])] : [] : generationKeys;
    if (!candidates.length) throw Object.assign(new Error('Tambahkan API key aktif pada akun ini.'), { status: 400 });
    const previous = job.result?.questions || [];
    const fullConfig = normalizeQuizConfig({ ...body.config, model: preferences.model, enableGrounding: preferences.grounding });
    const batchConfig = nextQuizBatch(fullConfig, previous);
    const cancellation = watchGenerationCancellation(job, userId, request.signal);
    try {
      let research;
      const generationState = job.result?.generationState || {};
      const persistGenerationState = async () => {
        cancellation.signal.throwIfAborted();
        job.result = { ...(job.result || {}), questions: previous, generationState };
        const { error } = await admin.rpc('qm_checkpoint_generation_state', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_state: generationState });
        if (error) throw Object.assign(new Error('Checkpoint percobaan gagal atau operasi dibatalkan.'), { status: 409, code: 'GENERATION_CHECKPOINT_FAILED' });
      };
      if (preferences.grounding && preferences.searchProvider === 'parallel') {
        const searchKey = keys.find(k => k.provider === 'parallel');
        if (!searchKey) throw Object.assign(new Error('Tambahkan atau aktifkan satu API key Parallel pada akun ini.'), { status: 400, code: 'PARALLEL_KEY_MISSING' });
        research = job.result?.parallelResearch;
        if (!generationState.parallelFallback && !usableResearch(research, batchConfig.topic, fullConfig)) {
          try { research = await searchParallel(batchConfig.topic, await getSecret(searchKey), cancellation.signal, fullConfig); await outcome(searchKey.id, userId, 'available'); }
          catch (error) {
            cancellation.signal.throwIfAborted();
            if (stableResearchFallbackCodes.includes(error.code) && !needsCurrentEvidence(fullConfig)) {
              generationState.parallelFallback = error.code; research = undefined;
              await outcome(searchKey.id, userId, 'available'); await persistGenerationState();
            } else { await outcome(searchKey.id, userId, statusOf(error)); throw error; }
          }
          // Persist evidence before generation so a failed batch can resume without another search.
          if (research) {
            job.result = { ...(job.result || {}), questions: previous, parallelResearch: research };
            const { error: researchError } = await admin.rpc('qm_checkpoint_research', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_research: research });
            if (researchError) throw Object.assign(new Error('Checkpoint pencarian belum tersimpan atau operasi dibatalkan.'), { status: 409, code: 'PARALLEL_CHECKPOINT_FAILED' });
          }
        }
      }
      let batch; let last; let keyIndex = 0;
      const state = generationState.attemptState?.batchOffset === previous.length ? generationState.attemptState : { batchOffset: previous.length, calls: 0, repeated: 0 };
      generationState.attemptState = state;
      if (state.calls >= preferences.maxAttempts || state.repeated >= 2) throw Object.assign(new Error('Batas percobaan batch tercapai. Periksa sumber, cakupan, dan difficulty sebelum membuat kuis baru.'), { status: 422, code: 'GENERATION_CIRCUIT_OPEN' });
      while (state.calls < preferences.maxAttempts) {
        cancellation.signal.throwIfAborted();
        const key = candidates[keyIndex];
        state.calls++; await persistGenerationState();
        try {
          batch = await generateQuizBatch({ ...batchConfig, enableGrounding: generationState.parallelFallback ? false : preferences.grounding }, await getSecret(key), previous.map(q => q.question), cancellation.signal, generationState.parallelFallback ? undefined : research, state.correction);
          if (generationState.parallelFallback) {
            batch.groundingFallbackUsed = true;
            batch.generationWarnings = ['Parallel tidak menyediakan materi yang relevan. Kuis ini dibuat tanpa referensi web dan tetap diperiksa kualitasnya.'];
          }
          cancellation.signal.throwIfAborted();
          await outcome(key.id, userId, 'available'); break;
        } catch (error) {
          cancellation.signal.throwIfAborted();
          last = classifyApiError(error, preferences.model); const status = String(last.code).startsWith('QUALITY_') ? 'available' : statusOf(last); await outcome(key.id, userId, status);
          try { recordGenerationFailure(state, last); } finally { await persistGenerationState(); }
          if (!isRetryableGenerationError(last) || String(last.code || '').startsWith('PARALLEL_')) break;
          if (status === 'invalid' || status === 'quota') { if (keyIndex + 1 >= candidates.length) break; keyIndex++; }
        }
      }
      if (!batch) throw last || new Error('Batch gagal.');
      delete generationState.attemptState;
      cancellation.signal.throwIfAborted();
      const quiz = { ...batch, ...body.config, id: job.id, questions: [...previous, ...batch.questions],
        generationState,
        qualityReviews: [...(job.result?.qualityReviews || []), ...(batch.qualityReviews || [])],
        generationMetrics: [...(job.result?.generationMetrics || []), ...(batch.generationMetrics || [])],
        groundingQueriesUsed: [...new Set([...(job.result?.groundingQueriesUsed || []), ...(batch.groundingQueriesUsed || [])])] };
      const complete = quiz.questions.length === body.config.questionCount;
      const { error: commitError } = await admin.rpc('qm_commit_job', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_result: quiz, p_status: complete ? 'completed' : 'pending' });
      if (commitError) throw new Error('Operasi berubah atau dibatalkan. Hasil batch tidak dipindahkan ke ruang lain.');
      return json({ quiz, complete });
    } finally { cancellation.stop(); }
  } catch (error) {
    if (job && userId) await admin.rpc('qm_commit_job', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_result: job.result, p_status: 'pending' });
    if (error?.name === 'AbortError' || request.signal.aborted) return json({ error: 'Pembuatan kuis dibatalkan.', code: 'CANCELLED' }, 409);
    // No provider request/credentials are logged or returned.
    const status = Number(error.status);
    const code = error.code || 'ACCOUNT_REQUEST_FAILED';
    console.warn(JSON.stringify({ event: 'quiz-ai-failure', status: status >= 400 && status <= 599 ? status : 502, code }));
    return json({ error: error.message || 'Operasi AI belum berhasil.', code }, status >= 400 && status <= 599 ? status : 502);
  }
});

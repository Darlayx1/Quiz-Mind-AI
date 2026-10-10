// @ts-nocheck -- Deno Edge runtime; bundled independently from the Vite application.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateQuizBatch, classifyApiError } from '../_shared/quiz-engine.ts';

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
    const raw = await request.text(); if (raw.length > 100000) return json({ error: 'Permintaan terlalu besar.' }, 413);
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
        await generateQuizBatch({ model: body.model, topic: 'Penjumlahan sederhana', questionCount: 1, difficulty: 'easy', timeLimitMinutes: 0, language: 'id', enableGrounding: false }, await getSecret(key), [], AbortSignal.timeout(80000));
        await outcome(key.id, userId, 'available'); return json({ success: true });
      } catch (error) { const classified = classifyApiError(error, body.model); await outcome(key.id, userId, statusOf(classified)); throw classified; }
    }
    if (body.action !== 'generate' || !/^[0-9a-f-]{36}$/i.test(body.operationId)) return json({ error: 'Operasi tidak valid.' }, 400);
    const preferences = body.preferences;
    if (!body.config || !Number.isInteger(body.config.questionCount) || body.config.questionCount < 1 || body.config.questionCount > 100) return json({ error: 'Jumlah soal harus 1–100.' }, 400);
    if (!preferences || !Number.isInteger(preferences.maxAttempts) || preferences.maxAttempts < 1 || preferences.maxAttempts > 3) return json({ error: 'Batas percobaan tidak valid.' }, 400);
    const { data: claimed, error: claimError } = await admin.rpc('qm_claim_job', { p_user: userId, p_id: body.operationId, p_config: body.config, p_preferences: preferences });
    if (claimError) return json({ error: claimError.code === '55P03' ? 'Batch masih diproses. Tunggu sebelum melanjutkan.' : claimError.message }, claimError.code === '55P03' ? 409 : 400);
    job = claimed;
    if (job.status === 'completed') return json({ quiz: job.result, complete: true });
    const selected = preferences.keyId ? keys.find(k => k.id === preferences.keyId) : null;
    const candidates = preferences.keyId ? selected ? [selected, ...(preferences.fallback ? keys.filter(k => k.id !== selected.id) : [])] : [] : keys;
    if (!candidates.length) throw Object.assign(new Error('Tambahkan API key aktif pada akun ini.'), { status: 400 });
    const previous = job.result?.questions || [];
    const count = Math.min(preferences.model === 'gemma-4-31b-it' ? 2 : 5, body.config.questionCount - previous.length);
    if (count < 1) throw Object.assign(new Error('Jumlah soal tidak valid.'), { status: 400 });
    let batch; let last; let keyIndex = 0;
    for (let attempt = 0; attempt < preferences.maxAttempts; attempt++) {
      const key = candidates[keyIndex];
      try {
        batch = await generateQuizBatch({ ...body.config, model: preferences.model, enableGrounding: preferences.grounding && preferences.model !== 'gemma-4-31b-it', questionCount: count }, await getSecret(key), previous.map(q => q.question), AbortSignal.timeout(40000));
        await outcome(key.id, userId, 'available'); break;
      } catch (error) {
        last = classifyApiError(error, preferences.model); const status = statusOf(last); await outcome(key.id, userId, status);
        if (last.status === 400 || last.status === 404) break;
        if (status === 'invalid' || status === 'quota') { if (keyIndex + 1 >= candidates.length) break; keyIndex++; }
      }
    }
    if (!batch) throw last || new Error('Batch gagal.');
    const quiz = { ...batch, ...body.config, id: job.id, questions: [...previous, ...batch.questions],
      groundingQueriesUsed: [...new Set([...(job.result?.groundingQueriesUsed || []), ...(batch.groundingQueriesUsed || [])])] };
    const complete = quiz.questions.length === body.config.questionCount;
    const { error: commitError } = await admin.rpc('qm_commit_job', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_result: quiz, p_status: complete ? 'completed' : 'pending' });
    if (commitError) throw new Error('Operasi berubah atau dibatalkan. Hasil batch tidak dipindahkan ke ruang lain.');
    return json({ quiz, complete });
  } catch (error) {
    if (job && userId) await admin.rpc('qm_commit_job', { p_user: userId, p_id: job.id, p_lease: job.lease_token, p_result: job.result, p_status: 'pending' });
    // No provider request/credentials are logged or returned.
    const status = Number(error.status); return json({ error: error.message || 'Operasi AI belum berhasil.' }, status >= 400 && status <= 599 ? status : 502);
  }
});

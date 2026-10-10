import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

await test('Parallel account storage on disposable PostgreSQL', async t => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,extensions to authenticated,service_role;
      insert into auth.users values('${owner}'),('${other}');`);
    await db.exec(await readFile('supabase/migrations/202610100001_workspace.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202610100003_remove_generation_deadline.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202610110001_parallel_search.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202610110002_generation_quality.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202610110003_single_call_high_policy.sql', 'utf8'));
    const asUser = async uid => { await db.exec(`reset role; set role authenticated;`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); };
    const put = async (id, provider, secret = null, enabled = null) => (await db.query('select public.qm_upsert_provider_key($1,$2,$3,$4,$5,$6) as id', [id, provider + ' key', secret, enabled, 1, provider])).rows[0].id;
    await asUser(owner);
    let parallel;
    await t.test('migrations execute; first key is saved and a disabled slot still counts', async () => {
      parallel = await put(null, 'parallel', 'fixture-parallel-account', false);
      await assert.rejects(put(null, 'parallel', 'fixture-second-account'), /Maksimal 1/);
      const rows = (await db.query('select * from public.qm_api_keys')).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].provider, 'parallel'); assert.ok(!JSON.stringify(rows).includes('fixture-parallel-account'));
      await assert.rejects(db.query('select * from private.qm_key_credentials'), /permission denied/);
    });
    await t.test('owner replacement works; provider changes and direct writes are rejected', async () => {
      await put(parallel, 'parallel', 'fixture-replaced-account', true);
      await assert.rejects(put(parallel, 'gemini'), /Penyedia key/);
      await assert.rejects(db.query('update public.qm_api_keys set enabled=false'), /permission denied/);
    });
    await t.test('cross-account metadata and writes are isolated', async () => {
      await asUser(other); assert.equal((await db.query('select * from public.qm_api_keys')).rows.length, 0);
      await assert.rejects(put(parallel, 'parallel', 'fixture-other-account'), /Key tidak ditemukan/);
      await put(null, 'parallel', 'fixture-other-account');
      await asUser(owner);
      assert.equal((await db.query('select * from public.qm_api_keys')).rows.length, 1);
    });
    await t.test('import skips conflicting Parallel by default and replaces only explicitly', async () => {
      const payload = { data: { history: [], activity: [], preferences: {} }, keys: [{ id: 'local-id', provider: 'parallel', label: 'Imported', secret: 'fixture-imported-account', enabled: true, priority: 1 }] };
      await db.query('select public.qm_import_local($1,false)', [payload]);
      await db.exec('reset role');
      assert.equal((await db.query('select secret from private.qm_key_credentials where key_id=$1', [parallel])).rows[0].secret, 'fixture-replaced-account');
      await asUser(owner);
      await db.query('select public.qm_import_local($1,false)', [{ ...payload, parallelConflict: 'replace' }]);
      await db.exec('reset role');
      assert.equal((await db.query('select secret from private.qm_key_credentials where key_id=$1', [parallel])).rows[0].secret, 'fixture-imported-account');
      await asUser(owner);
      assert.equal((await db.query("select id from public.qm_api_keys where provider='parallel'")).rows[0].id, parallel);
    });
    await t.test('100 Gemini keys remain independent of the one Parallel slot', async () => {
      await db.query("select public.qm_upsert_key(null,'Google '||i,'fixture-google-account-'||i,true,i) from generate_series(1,100) i");
      await assert.rejects(put(null, 'gemini', 'fixture-google-over-limit'), /100/);
      assert.equal((await db.query('select * from public.qm_api_keys')).rows.length, 101);
    });
    await t.test('unique index protects the singleton even against privileged bypasses', async () => {
      await db.exec('reset role');
      await assert.rejects(db.query("insert into public.qm_api_keys(user_id,label,suffix,fingerprint,provider) values($1,'Bypass','0000','bypass','parallel')", [owner]), /duplicate key/);
    });
    await t.test('service helpers check owner; checkpoint is private and preserves the active lease', async () => {
      await asUser(owner);
      await assert.rejects(db.query('select public.qm_service_credential($1,$2)', [owner, parallel]), /permission denied/);
      await db.exec('reset role; set role service_role');
      assert.equal((await db.query('select public.qm_service_credential($1,$2) as secret', [other, parallel])).rows[0].secret, null);
      const id = '00000000-0000-4000-8000-000000000003';
      const job = (await db.query('select public.qm_claim_job($1,$2,$3,$4) as job', [owner, id, { topic: 'Concept' }, {}])).rows[0].job;
      await db.query('select public.qm_checkpoint_research($1,$2,$3,$4)', [owner, id, job.lease_token, { provider: 'parallel' }]);
      const saved = (await db.query('select * from public.qm_ai_jobs where id=$1', [id])).rows[0];
      assert.equal(saved.status, 'running'); assert.equal(saved.lease_token, job.lease_token); assert.equal(saved.result.parallelResearch.provider, 'parallel');
      await assert.rejects(db.query('select public.qm_checkpoint_research($1,$2,$3,$4)', [other, id, job.lease_token, {}]), /Operasi berubah/);
      const state = { attemptState: { batchOffset: 0, calls: 2, repeated: 1, correction: 'Gunakan konsep inti' } };
      await db.query('select public.qm_checkpoint_generation_state($1,$2,$3,$4)', [owner, id, job.lease_token, state]);
      const checkpoint = (await db.query('select * from public.qm_ai_jobs where id=$1', [id])).rows[0];
      assert.deepEqual(checkpoint.result.generationState, state);
      assert.equal(checkpoint.lease_token, job.lease_token); assert.equal(checkpoint.status, 'running');
      assert.equal(checkpoint.result.parallelResearch.provider, 'parallel');
      await assert.rejects(db.query('select public.qm_checkpoint_generation_state($1,$2,$3,$4)', [other, id, job.lease_token, state]), /Lease operasi/);
      await assert.rejects(db.query('select public.qm_checkpoint_generation_state($1,$2,$3,$4)', [owner, id, job.lease_token, { attemptState: { ...state.attemptState, calls: 4 } }]), /Batas percobaan/);
      await asUser(owner);
      await assert.rejects(db.query('select public.qm_checkpoint_generation_state($1,$2,$3,$4)', [owner, id, job.lease_token, state]), /permission denied/);
    });
    await t.test('single-call-high-v1: atomic dispatch reservation, permanent single-call, hardened commit and owner polling', async () => {
      await db.exec('reset role; set role service_role');
      const singleId = '00000000-0000-4000-8000-000000000010';
      const config = { topic: 'Matematika', questionCount: 5 };
      const prefs = { model: 'gemini-3.8-flash' };
      const job = (await db.query('select public.qm_claim_job($1,$2,$3,$4) as job', [owner, singleId, config, prefs])).rows[0].job;
      assert.equal(job.policy_version, 'single-call-high-v1');
      assert.equal(job.model_call_count, 0);
      assert.equal(job.dispatch_reserved_at, null);

      // First reservation succeeds
      const firstReserved = (await db.query('select public.qm_reserve_dispatch($1,$2,$3) as ok', [owner, singleId, job.lease_token])).rows[0].ok;
      assert.equal(firstReserved, true);

      // Second reservation fails
      const secondReserved = (await db.query('select public.qm_reserve_dispatch($1,$2,$3) as ok', [owner, singleId, job.lease_token])).rows[0].ok;
      assert.equal(secondReserved, false);

      const rowAfterReserve = (await db.query('select * from public.qm_ai_jobs where id=$1', [singleId])).rows[0];
      assert.equal(rowAfterReserve.model_call_count, 1);
      assert.ok(rowAfterReserve.dispatch_reserved_at);
      assert.equal(rowAfterReserve.phase, 'dispatch_reserved');

      // Attempting to revert to pending after reservation is rejected
      await assert.rejects(
        db.query('select public.qm_commit_job($1,$2,$3,$4,$5)', [owner, singleId, job.lease_token, { questions: [] }, 'pending']),
        /dilarang kembali ke status pending/
      );

      // Expire lease artificially and try to claim again - must be rejected!
      await db.query("update public.qm_ai_jobs set lease_until = now() - interval '1 second' where id=$1", [singleId]);
      await assert.rejects(
        db.query('select public.qm_claim_job($1,$2,$3,$4)', [owner, singleId, config, prefs]),
        /sudah pernah dikirim/
      );

      // Owner can poll status
      await asUser(owner);
      const poll = (await db.query('select public.qm_poll_job($1) as p', [singleId])).rows[0].p;
      assert.equal(poll.id, singleId);
      assert.equal(poll.modelCallCount, 1);
      assert.equal(poll.completed, false);

      // Other user cannot poll
      await asUser(other);
      await assert.rejects(db.query('select public.qm_poll_job($1)', [singleId]), /Operasi tidak ditemukan/);

      // Commit completed works
      await db.exec('reset role; set role service_role');
      const fakeResult = { id: singleId, topic: 'Matematika', questions: [{ question: 'Q1' }] };
      await db.query('select public.qm_commit_job($1,$2,$3,$4,$5)', [owner, singleId, job.lease_token, fakeResult, 'completed']);

      await asUser(owner);
      const pollCompleted = (await db.query('select public.qm_poll_job($1) as p', [singleId])).rows[0].p;
      assert.equal(pollCompleted.completed, true);
      assert.equal(pollCompleted.status, 'completed');
      assert.equal(pollCompleted.phase, 'completed');
      assert.equal(pollCompleted.result.questions.length, 1);
    });
    await t.test('deletion cascades to the secret and makes a new Parallel slot available', async () => {
      await asUser(owner); await db.query('select public.qm_remove_key($1)', [parallel]);
      await put(null, 'parallel', 'fixture-new-account');
      await db.exec('reset role');
      assert.equal((await db.query('select * from private.qm_key_credentials where key_id=$1', [parallel])).rows.length, 0);
    });
  } finally { await db.close(); }
});

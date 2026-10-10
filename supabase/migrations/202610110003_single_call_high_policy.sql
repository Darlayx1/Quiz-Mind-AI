begin;

-- Invariant columns for single-call policy and lifecycle tracking
alter table public.qm_ai_jobs
  add column if not exists policy_version text not null default 'single-call-high-v1',
  add column if not exists phase text not null default 'accepted',
  add column if not exists dispatch_reserved_at timestamptz,
  add column if not exists model_call_count integer not null default 0,
  add column if not exists config_fingerprint text;

-- Isolate legacy jobs so new workers do not process old multi-batch records
update public.qm_ai_jobs
  set policy_version = 'legacy-batch'
  where policy_version = 'single-call-high-v1' and status in ('running', 'pending') and dispatch_reserved_at is null;

-- Atomic dispatch reservation: can only be claimed ONCE per operationId
create or replace function public.qm_reserve_dispatch(p_user uuid, p_id uuid, p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_updated integer;
begin
  update public.qm_ai_jobs
  set phase = 'dispatch_reserved',
      dispatch_reserved_at = coalesce(dispatch_reserved_at, now()),
      model_call_count = model_call_count + 1,
      updated_at = now()
  where id = p_id
    and user_id = p_user
    and lease_token = p_lease
    and status = 'running'
    and dispatch_reserved_at is null
    and model_call_count = 0;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end $$;

-- Claim job with strict reservation checks: lease expiry cannot reopen a reserved job
create or replace function public.qm_claim_job(p_user uuid, p_id uuid, p_config jsonb, p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  job public.qm_ai_jobs;
  lease uuid := gen_random_uuid();
  v_fp text := encode(extensions.digest((coalesce(p_config::text,'') || coalesce(p_preferences::text,''))::bytea, 'sha256'), 'hex');
begin
  insert into public.qm_ai_jobs(id, user_id, config, preferences, config_fingerprint, policy_version, phase)
  values(p_id, p_user, p_config, p_preferences, v_fp, 'single-call-high-v1', 'accepted')
  on conflict do nothing;

  select * into job from public.qm_ai_jobs where id = p_id for update;
  if job.user_id <> p_user then
    raise exception 'Operasi tidak diizinkan' using errcode = '42501';
  end if;
  if job.config <> p_config or job.preferences <> p_preferences then
    raise exception 'Konfigurasi operasi berubah';
  end if;
  if job.status = 'completed' then
    return to_jsonb(job);
  end if;
  if job.status in ('cancelled', 'failed', 'failed_after_dispatch', 'failed_preflight') then
    raise exception 'Operasi dihentikan. Buat operasi baru';
  end if;
  -- If dispatch has already been reserved, the single-call right was consumed.
  if job.dispatch_reserved_at is not null or job.model_call_count > 0 then
    raise exception 'Operasi sudah pernah dikirim ke model AI.' using errcode = '55P03';
  end if;
  if job.lease_until > now() then
    raise exception 'Batch masih diproses' using errcode = '55P03';
  end if;

  update public.qm_ai_jobs
  set lease_until = now() + interval '180 seconds',
      lease_token = lease,
      status = 'running',
      phase = 'preparing',
      updated_at = now()
  where id = p_id
  returning * into job;

  return to_jsonb(job);
end $$;

-- Hardened commit: prevents resetting status to pending once dispatch was reserved
create or replace function public.qm_commit_job(p_user uuid, p_id uuid, p_lease uuid, p_result jsonb, p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_job public.qm_ai_jobs;
begin
  select * into v_job from public.qm_ai_jobs where id = p_id and user_id = p_user and lease_token = p_lease;
  if not found then
    raise exception 'Lease operasi berubah';
  end if;

  if v_job.dispatch_reserved_at is not null and p_status = 'pending' then
    raise exception 'Operasi yang sudah dikirim ke model dilarang kembali ke status pending';
  end if;

  update public.qm_ai_jobs
  set result = p_result,
      cursor = coalesce(jsonb_array_length(p_result->'questions'), 0),
      status = p_status,
      phase = case
        when p_status = 'completed' then 'completed'
        when p_status in ('failed', 'failed_after_dispatch') then 'failed_after_dispatch'
        when p_status = 'cancelled' then 'cancelled'
        else phase
      end,
      lease_until = null,
      updated_at = now()
  where id = p_id and user_id = p_user and lease_token = p_lease;
end $$;

-- Authenticated poll job status: pure read, zero AI dispatch
create or replace function public.qm_poll_job(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  v_job public.qm_ai_jobs;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode = '42501'; end if;
  select * into v_job from public.qm_ai_jobs where id = p_id and user_id = uid;
  if not found then raise exception 'Operasi tidak ditemukan' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'phase', v_job.phase,
    'policyVersion', v_job.policy_version,
    'modelCallCount', v_job.model_call_count,
    'dispatchReservedAt', v_job.dispatch_reserved_at,
    'completed', (v_job.status = 'completed'),
    'result', case when v_job.status = 'completed' then v_job.result else null end,
    'updatedAt', v_job.updated_at
  );
end $$;

revoke all on function public.qm_reserve_dispatch(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.qm_reserve_dispatch(uuid, uuid, uuid) to service_role;

revoke all on function public.qm_poll_job(uuid) from public, anon;
grant execute on function public.qm_poll_job(uuid) to authenticated;

commit;

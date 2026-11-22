begin;

-- Optional precise quota pause deadline (e.g. ~60s for RPM vs 24h for RPD)
alter table public.qm_api_keys
  add column if not exists paused_until timestamptz;

-- Enhanced owner poll job status: includes progress cursor, error metadata, and stale-lease detection
create or replace function public.qm_poll_job(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  v_job public.qm_ai_jobs;
  v_stale boolean;
  v_status text;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode = '42501'; end if;
  select * into v_job from public.qm_ai_jobs where id = p_id and user_id = uid;
  if not found then raise exception 'Operasi tidak ditemukan' using errcode = '42501'; end if;
  v_stale := (v_job.status = 'running' and v_job.lease_until is not null and v_job.lease_until < now());
  v_status := case when v_stale then 'failed_after_dispatch' else v_job.status end;
  return jsonb_build_object(
    'id', v_job.id,
    'status', v_status,
    'phase', case when v_stale then 'failed_after_dispatch' else v_job.phase end,
    'cursor', coalesce(v_job.cursor, 0),
    'receivedQuestionCount', coalesce(v_job.cursor, 0),
    'policyVersion', v_job.policy_version,
    'modelCallCount', v_job.model_call_count,
    'dispatchReservedAt', v_job.dispatch_reserved_at,
    'completed', (v_status = 'completed'),
    'complete', (v_status = 'completed'),
    'result', case when v_status = 'completed' then v_job.result else null end,
    'error', case
      when v_stale then coalesce(v_job.result->>'error', 'Operasi melewati batas waktu pemrosesan server. Silakan coba kembali.')
      when v_status in ('failed_after_dispatch', 'failed_preflight', 'failed') then coalesce(v_job.result->>'error', 'Operasi gagal.')
      else null
    end,
    'code', case when v_stale then coalesce(v_job.result->>'code', 'TIMEOUT') else v_job.result->>'code' end,
    'statusCode', case when v_stale then coalesce((v_job.result->>'statusCode')::integer, 504) else (v_job.result->>'statusCode')::integer end,
    'updatedAt', v_job.updated_at
  );
end $$;

revoke all on function public.qm_poll_job(uuid) from public, anon;
grant execute on function public.qm_poll_job(uuid) to authenticated;

commit;

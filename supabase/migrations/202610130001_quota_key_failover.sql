-- Keep manual enabled state separate from the automatic 24-hour pause.
-- status + tested_at persist the pause across devices and sessions.
alter table public.qm_ai_jobs add column if not exists last_quota_retry_key uuid;

create or replace function public.qm_reserve_quota_retry(p_user uuid,p_id uuid,p_lease uuid,p_failed_key uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.qm_api_keys where id=p_failed_key and user_id=p_user and status='quota' and tested_at > now()-interval '1 day') then
    return false;
  end if;
  update public.qm_ai_jobs set model_call_count=model_call_count+1, cursor=0, phase='dispatching', last_quota_retry_key=p_failed_key, updated_at=now()
  where id=p_id and user_id=p_user and lease_token=p_lease and status='running' and model_call_count between 1 and 2 and last_quota_retry_key is distinct from p_failed_key;
  return found;
end $$;
revoke all on function public.qm_reserve_quota_retry(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.qm_reserve_quota_retry(uuid,uuid,uuid,uuid) to service_role;

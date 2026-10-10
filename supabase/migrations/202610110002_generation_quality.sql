begin;

-- Checkpoint the shared attempt budget without releasing the active lease.
create or replace function public.qm_checkpoint_generation_state(p_user uuid,p_id uuid,p_lease uuid,p_state jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_state) is distinct from 'object' then raise exception 'State generasi tidak valid'; end if;
  if p_state ? 'attemptState' and (
    jsonb_typeof(p_state->'attemptState') is distinct from 'object' or
    coalesce(p_state->'attemptState'->>'calls','') !~ '^[0-3]$' or
    coalesce(p_state->'attemptState'->>'batchOffset','') !~ '^(0|[1-9][0-9]?)$' or
    coalesce(p_state->'attemptState'->>'repeated','') !~ '^[0-3]$'
  ) then raise exception 'Batas percobaan tidak valid'; end if;
  update public.qm_ai_jobs
    set result=jsonb_set(coalesce(result,'{"questions":[]}'::jsonb),'{generationState}',p_state),updated_at=now()
    where id=p_id and user_id=p_user and lease_token=p_lease and status='running';
  if not found then raise exception 'Lease operasi berubah atau dibatalkan'; end if;
end $$;
revoke all on function public.qm_checkpoint_generation_state(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.qm_checkpoint_generation_state(uuid,uuid,uuid,jsonb) to service_role;

commit;

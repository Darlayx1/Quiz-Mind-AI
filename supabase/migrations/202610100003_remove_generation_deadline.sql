-- Keep generation jobs resumable until they complete or the user cancels them.
create or replace function public.qm_claim_job(p_user uuid,p_id uuid,p_config jsonb,p_preferences jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.qm_ai_jobs; lease uuid:=gen_random_uuid();
begin
  insert into public.qm_ai_jobs(id,user_id,config,preferences) values(p_id,p_user,p_config,p_preferences) on conflict do nothing;
  select * into job from public.qm_ai_jobs where id=p_id for update;
  if job.user_id<>p_user then raise exception 'Operasi tidak diizinkan' using errcode='42501'; end if;
  if job.config<>p_config or job.preferences<>p_preferences then raise exception 'Konfigurasi operasi berubah'; end if;
  if job.status='completed' then return to_jsonb(job); end if;
  if job.status in ('cancelled','failed') then raise exception 'Operasi dihentikan. Buat operasi baru'; end if;
  if job.lease_until>now() then raise exception 'Batch masih diproses' using errcode='55P03'; end if;
  update public.qm_ai_jobs set lease_until=now()+interval '180 seconds',lease_token=lease,status='running',updated_at=now() where id=p_id returning * into job;
  return to_jsonb(job);
end $$;

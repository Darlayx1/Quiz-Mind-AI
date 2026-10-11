-- A stale application revision is an HTTP conflict, not a retryable PostgreSQL
-- serialization failure. PostgREST 14 retries 40001 indefinitely.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '10s';

create or replace function public.qm_save_workspace(p_data jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); next_revision bigint;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000000 then raise exception 'Data workspace tidak valid'; end if;
  update public.qm_workspaces set data=p_data,revision=revision+1,updated_at=now() where user_id=uid and revision=p_revision returning revision into next_revision;
  if next_revision is null then raise exception 'Data berubah di perangkat lain' using errcode='PT409'; end if;
  return next_revision;
end $$;

commit;

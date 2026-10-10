begin;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.qm_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.qm_api_keys (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 80), suffix text not null,
  fingerprint text not null, enabled boolean not null default true, priority integer not null default 1,
  status text not null default 'untested' check (status in ('untested','available','invalid','quota','unavailable')),
  tested_at timestamptz, successes integer not null default 0, failures integer not null default 0,
  unique(user_id,fingerprint)
);
create index if not exists qm_keys_owner_order on public.qm_api_keys(user_id,priority);
create table if not exists private.qm_key_credentials (
  key_id uuid primary key references public.qm_api_keys(id) on delete cascade, secret text not null
);
create table if not exists public.qm_ai_jobs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  config jsonb not null, preferences jsonb not null, result jsonb, cursor integer not null default 0,
  status text not null default 'pending', lease_until timestamptz, lease_token uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.qm_workspaces enable row level security;
alter table public.qm_api_keys enable row level security;
alter table public.qm_ai_jobs enable row level security;
alter table private.qm_key_credentials enable row level security;
revoke all on public.qm_workspaces, public.qm_api_keys, public.qm_ai_jobs from anon,authenticated;
revoke all on private.qm_key_credentials from public,anon,authenticated;
revoke all on schema private from public,anon,authenticated;
grant select on public.qm_workspaces, public.qm_api_keys, public.qm_ai_jobs to authenticated;
grant usage on schema private to service_role;
grant all on private.qm_key_credentials,public.qm_workspaces,public.qm_api_keys,public.qm_ai_jobs to service_role;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='qm_workspaces' and policyname='qm_workspace_read') then
    create policy qm_workspace_read on public.qm_workspaces for select to authenticated using ((select auth.uid())=user_id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='qm_api_keys' and policyname='qm_keys_read') then
    create policy qm_keys_read on public.qm_api_keys for select to authenticated using ((select auth.uid())=user_id);
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='qm_ai_jobs' and policyname='qm_jobs_read') then
    create policy qm_jobs_read on public.qm_ai_jobs for select to authenticated using ((select auth.uid())=user_id);
  end if;
end $$;

create or replace function public.qm_load_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); output jsonb;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  insert into public.qm_workspaces(user_id) values(uid) on conflict do nothing;
  select jsonb_build_object('revision',revision,'data',data) into output from public.qm_workspaces where user_id=uid;
  return output;
end $$;
create or replace function public.qm_save_workspace(p_data jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); next_revision bigint;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000000 then raise exception 'Data workspace tidak valid'; end if;
  update public.qm_workspaces set data=p_data,revision=revision+1,updated_at=now() where user_id=uid and revision=p_revision returning revision into next_revision;
  if next_revision is null then raise exception 'Data berubah di perangkat lain' using errcode='40001'; end if;
  return next_revision;
end $$;
create or replace function public.qm_upsert_key(p_id uuid,p_label text,p_secret text,p_enabled boolean,p_priority integer) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target uuid:=coalesce(p_id,gen_random_uuid()); current_key public.qm_api_keys; digest text; secret_value text:=nullif(btrim(p_secret),'');
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  perform public.qm_load_workspace();
  perform 1 from public.qm_workspaces where user_id=uid for update;
  if length(btrim(p_label)) not between 1 and 80 then raise exception 'Nama key wajib diisi, maksimal 80 karakter'; end if;
  if p_id is not null then
    select * into current_key from public.qm_api_keys where id=p_id and user_id=uid;
    if not found then raise exception 'Key tidak ditemukan' using errcode='42501'; end if;
  else
    if (select count(*) from public.qm_api_keys where user_id=uid)>=100 then raise exception 'Maksimal 100 API key per akun'; end if;
    if secret_value is null then raise exception 'Masukkan API key'; end if;
  end if;
  if secret_value is not null then
    if length(secret_value) not between 8 and 1024 then raise exception 'API key harus berisi 8–1024 karakter'; end if;
    digest:=encode(extensions.digest(secret_value,'sha256'),'hex');
    if exists(select 1 from public.qm_api_keys where user_id=uid and fingerprint=digest and id<>target) then raise exception 'API key ini sudah tersimpan di akun'; end if;
  end if;
  insert into public.qm_api_keys(id,user_id,label,suffix,fingerprint,enabled,priority)
  values(target,uid,btrim(p_label),coalesce(right(secret_value,4),current_key.suffix),coalesce(digest,current_key.fingerprint),coalesce(p_enabled,true),coalesce(p_priority,(select coalesce(max(priority),0)+1 from public.qm_api_keys where user_id=uid)))
  on conflict(id) do update set label=excluded.label,suffix=excluded.suffix,fingerprint=excluded.fingerprint,
    enabled=coalesce(p_enabled,current_key.enabled),priority=coalesce(p_priority,current_key.priority),
    status=case when secret_value is null then current_key.status else 'untested' end,
    tested_at=case when secret_value is null then current_key.tested_at else null end;
  if secret_value is not null then insert into private.qm_key_credentials(key_id,secret) values(target,secret_value) on conflict(key_id) do update set secret=excluded.secret; end if;
  return target;
end $$;
create or replace function public.qm_remove_key(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  perform 1 from public.qm_workspaces where user_id=uid for update;
  delete from public.qm_api_keys where id=p_id and user_id=uid;
  update public.qm_workspaces set data=jsonb_set(data,'{preferences,keyId}','null'),revision=revision+1,updated_at=now()
  where user_id=uid and data#>>'{preferences,keyId}'=p_id::text;
end $$;

create or replace function public.qm_import_local(p_payload jsonb,p_import_preferences boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); entry jsonb; target uuid; mapping jsonb:='{}'; source jsonb:=p_payload->'data'; existing jsonb; history jsonb; activity jsonb; keys_added integer:=0;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  perform public.qm_load_workspace();
  select data into existing from public.qm_workspaces where user_id=uid for update;
  for entry in select value from jsonb_array_elements(coalesce(p_payload->'keys','[]')) loop
    select id into target from public.qm_api_keys where user_id=uid and fingerprint=encode(extensions.digest(entry->>'secret','sha256'),'hex');
    if target is null then
      target:=public.qm_upsert_key(null,entry->>'label',entry->>'secret',(entry->>'enabled')::boolean,(entry->>'priority')::integer); keys_added:=keys_added+1;
    end if;
    mapping:=mapping||jsonb_build_object(entry->>'id',target::text);
  end loop;
  select coalesce(jsonb_agg(value),'[]') into history from (
    select distinct on(value#>>'{quiz,id}') value from jsonb_array_elements(coalesce(existing->'history','[]')||coalesce(source->'history','[]'))
    where value#>>'{quiz,id}' is not null order by value#>>'{quiz,id}',value->>'savedAt' desc
  ) records;
  select coalesce(jsonb_agg(value),'[]') into activity from (
    select distinct on(value->>'id') case when mapping ? (value->>'keyId') then jsonb_set(value,'{keyId}',mapping->(value->>'keyId')) else value-'keyId' end as value
    from jsonb_array_elements(coalesce(existing->'activity','[]')||coalesce(source->'activity','[]')) order by value->>'id'
  ) records;
  existing:=existing||jsonb_build_object('history',history,'activity',activity);
  if p_import_preferences then
    entry:=coalesce(source->'preferences','{}');
    entry:=entry||jsonb_build_object('keyId',coalesce(mapping->(entry->>'keyId'),'null'::jsonb));
    existing:=existing||jsonb_build_object('preferences',entry);
  end if;
  update public.qm_workspaces set data=existing,revision=revision+1,updated_at=now() where user_id=uid;
  return jsonb_build_object('keysAdded',keys_added,'historyCount',jsonb_array_length(history));
end $$;

-- Service-only helpers: ownership is also checked here, beyond Edge authentication.
create or replace function public.qm_service_credential(p_user uuid,p_key uuid) returns text language sql security definer set search_path='' as $$
  select c.secret from private.qm_key_credentials c join public.qm_api_keys k on k.id=c.key_id where k.user_id=p_user and k.id=p_key and k.enabled;
$$;
create or replace function public.qm_claim_job(p_user uuid,p_id uuid,p_config jsonb,p_preferences jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.qm_ai_jobs; lease uuid:=gen_random_uuid();
begin
  insert into public.qm_ai_jobs(id,user_id,config,preferences) values(p_id,p_user,p_config,p_preferences) on conflict do nothing;
  select * into job from public.qm_ai_jobs where id=p_id for update;
  if job.user_id<>p_user then raise exception 'Operasi tidak diizinkan' using errcode='42501'; end if;
  if job.config<>p_config or job.preferences<>p_preferences then raise exception 'Konfigurasi operasi berubah'; end if;
  if job.status='completed' then return to_jsonb(job); end if;
  if job.status in ('cancelled','failed') then raise exception 'Operasi dihentikan. Buat operasi baru'; end if;
  if job.created_at<now()-interval '30 minutes' then raise exception 'Deadline operasi terlampaui'; end if;
  if job.lease_until>now() then raise exception 'Batch masih diproses' using errcode='55P03'; end if;
  update public.qm_ai_jobs set lease_until=now()+interval '180 seconds',lease_token=lease,status='running',updated_at=now() where id=p_id returning * into job;
  return to_jsonb(job);
end $$;
create or replace function public.qm_commit_job(p_user uuid,p_id uuid,p_lease uuid,p_result jsonb,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.qm_ai_jobs set result=p_result,cursor=coalesce(jsonb_array_length(p_result->'questions'),0),status=p_status,lease_until=null,updated_at=now()
  where id=p_id and user_id=p_user and lease_token=p_lease;
  if not found then raise exception 'Lease operasi berubah'; end if;
end $$;
create or replace function public.qm_cancel_job(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  update public.qm_ai_jobs set status='cancelled',lease_token=null,lease_until=null,updated_at=now() where id=p_id and user_id=auth.uid() and status<>'completed';
end $$;
revoke all on function public.qm_load_workspace(),public.qm_save_workspace(jsonb,bigint),public.qm_upsert_key(uuid,text,text,boolean,integer),public.qm_remove_key(uuid),public.qm_import_local(jsonb,boolean),public.qm_cancel_job(uuid) from public,anon;
grant execute on function public.qm_load_workspace(),public.qm_save_workspace(jsonb,bigint),public.qm_upsert_key(uuid,text,text,boolean,integer),public.qm_remove_key(uuid),public.qm_import_local(jsonb,boolean),public.qm_cancel_job(uuid) to authenticated;
revoke all on function public.qm_service_credential(uuid,uuid),public.qm_claim_job(uuid,uuid,jsonb,jsonb),public.qm_commit_job(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.qm_service_credential(uuid,uuid),public.qm_claim_job(uuid,uuid,jsonb,jsonb),public.qm_commit_job(uuid,uuid,uuid,jsonb,text) to service_role;
commit;

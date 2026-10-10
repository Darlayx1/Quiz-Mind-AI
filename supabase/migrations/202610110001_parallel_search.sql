begin;
alter table public.qm_api_keys add column provider text not null default 'gemini' check(provider in ('gemini','parallel'));
create unique index qm_one_parallel_key_per_owner on public.qm_api_keys(user_id) where provider='parallel';
create or replace function public.qm_upsert_provider_key(p_id uuid,p_label text,p_secret text,p_enabled boolean,p_priority integer,p_provider text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target uuid:=coalesce(p_id,gen_random_uuid()); current_key public.qm_api_keys; digest text; secret_value text:=nullif(btrim(p_secret),''); provider_value text;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  perform public.qm_load_workspace();
  perform 1 from public.qm_workspaces where user_id=uid for update;
  if length(btrim(p_label)) not between 1 and 80 then raise exception 'Nama key wajib diisi, maksimal 80 karakter'; end if;
  if p_id is not null then
    select * into current_key from public.qm_api_keys where id=p_id and user_id=uid;
    if not found then raise exception 'Key tidak ditemukan' using errcode='42501'; end if;
  else
    
    if secret_value is null then raise exception 'Masukkan API key'; end if;
  end if;
  provider_value:=coalesce(p_provider,current_key.provider,'gemini');
  if provider_value not in ('gemini','parallel') then raise exception 'Penyedia key tidak valid'; end if;
  if p_id is not null and provider_value<>current_key.provider then raise exception 'Penyedia key tidak dapat diubah'; end if;
  if p_id is null and provider_value='parallel' and exists(select 1 from public.qm_api_keys where user_id=uid and provider='parallel') then raise exception 'Maksimal 1 API key Parallel per akun. Ganti key yang sudah ada.'; end if;
  if p_id is null and provider_value='gemini' and (select count(*) from public.qm_api_keys where user_id=uid and provider='gemini')>=100 then raise exception 'Maksimal 100 API key Gemini per akun'; end if;
  if secret_value is not null and provider_value='parallel' and secret_value ~ '[[:space:]]' then raise exception 'API key Parallel tidak boleh mengandung spasi'; end if;
  if secret_value is not null then
    if length(secret_value) not between 8 and 1024 then raise exception 'API key harus berisi 8–1024 karakter'; end if;
    digest:=encode(extensions.digest(secret_value,'sha256'),'hex');
    if exists(select 1 from public.qm_api_keys where user_id=uid and fingerprint=digest and id<>target) then raise exception 'API key ini sudah tersimpan di akun'; end if;
  end if;
  insert into public.qm_api_keys(id,user_id,label,suffix,fingerprint,enabled,priority,provider)
  values(target,uid,btrim(p_label),coalesce(right(secret_value,4),current_key.suffix),coalesce(digest,current_key.fingerprint),coalesce(p_enabled,true),coalesce(p_priority,(select coalesce(max(priority),0)+1 from public.qm_api_keys where user_id=uid)),provider_value)
  on conflict(id) do update set label=excluded.label,suffix=excluded.suffix,fingerprint=excluded.fingerprint,
    enabled=coalesce(p_enabled,current_key.enabled),priority=coalesce(p_priority,current_key.priority),
    status=case when secret_value is null then current_key.status else 'untested' end,
    tested_at=case when secret_value is null then current_key.tested_at else null end;
  if secret_value is not null then insert into private.qm_key_credentials(key_id,secret) values(target,secret_value) on conflict(key_id) do update set secret=excluded.secret; end if;
  return target;
end $$;

-- Keep legacy clients compatible while enforcing provider boundaries.
create or replace function public.qm_upsert_key(p_id uuid,p_label text,p_secret text,p_enabled boolean,p_priority integer) returns uuid language sql security definer set search_path='' as $$
  select public.qm_upsert_provider_key(p_id,p_label,p_secret,p_enabled,p_priority,'gemini');
$$;
create or replace function public.qm_import_local(p_payload jsonb,p_import_preferences boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); entry jsonb; target uuid; mapping jsonb:='{}'; source jsonb:=p_payload->'data'; existing jsonb; history jsonb; activity jsonb; keys_added integer:=0;
begin
  if uid is null then raise exception 'Login diperlukan' using errcode='42501'; end if;
  perform public.qm_load_workspace();
  select data into existing from public.qm_workspaces where user_id=uid for update;
  for entry in select value from jsonb_array_elements(coalesce(p_payload->'keys','[]')) loop
    select id into target from public.qm_api_keys where user_id=uid and provider=coalesce(entry->>'provider','gemini') and fingerprint=encode(extensions.digest(entry->>'secret','sha256'),'hex');
    if target is null then
      if entry->>'provider'='parallel' then
        select id into target from public.qm_api_keys where user_id=uid and provider='parallel';
        if target is not null and coalesce(p_payload->>'parallelConflict','skip')<>'replace' then continue; end if;
      end if;
      target:=public.qm_upsert_provider_key(target,entry->>'label',entry->>'secret',(entry->>'enabled')::boolean,(entry->>'priority')::integer,coalesce(entry->>'provider','gemini')); keys_added:=keys_added+1;
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


revoke all on function public.qm_upsert_provider_key(uuid,text,text,boolean,integer,text) from public,anon;
grant execute on function public.qm_upsert_provider_key(uuid,text,text,boolean,integer,text) to authenticated;
-- Save search evidence without releasing the lease of an active batch.
create or replace function public.qm_checkpoint_research(p_user uuid,p_id uuid,p_lease uuid,p_research jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.qm_ai_jobs set result=jsonb_set(coalesce(result,'{"questions":[]}'::jsonb),'{parallelResearch}',p_research),updated_at=now()
  where id=p_id and user_id=p_user and lease_token=p_lease and status='running';
  if not found then raise exception 'Operasi berubah atau dibatalkan'; end if;
end $$;
revoke all on function public.qm_checkpoint_research(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.qm_checkpoint_research(uuid,uuid,uuid,jsonb) to service_role;
commit;

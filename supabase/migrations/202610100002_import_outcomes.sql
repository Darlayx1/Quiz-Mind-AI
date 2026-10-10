begin;
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
    from jsonb_array_elements(coalesce(source->'activity','[]')) order by value->>'id'
  ) records;
  select coalesce(jsonb_agg(value),'[]') into activity from (select distinct on(value->>'id') value from jsonb_array_elements(coalesce(existing->'activity','[]')||activity) order by value->>'id') records;
  existing:=existing||jsonb_build_object('history',history,'activity',activity);
  if p_import_preferences then
    entry:=coalesce(source->'preferences','{}');
    entry:=entry||jsonb_build_object('keyId',coalesce(mapping->(entry->>'keyId'),'null'::jsonb));
    existing:=existing||jsonb_build_object('preferences',entry);
  end if;
  update public.qm_workspaces set data=existing,revision=revision+1,updated_at=now() where user_id=uid;
  return jsonb_build_object('keysAdded',keys_added,'historyCount',jsonb_array_length(history));
end $$;

create or replace function public.qm_record_outcome(p_user uuid,p_key uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
update public.qm_api_keys set status=p_status,tested_at=now(),successes=successes+case when p_status='available' then 1 else 0 end,failures=failures+case when p_status='available' then 0 else 1 end where user_id=p_user and id=p_key;
end $$;
revoke all on function public.qm_record_outcome(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.qm_record_outcome(uuid,uuid,text) to service_role;
commit;

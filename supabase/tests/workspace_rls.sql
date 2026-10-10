-- All fixture users and records are rolled back. No email or provider calls.
begin;
select set_config('qm.test_a',gen_random_uuid()::text,true),set_config('qm.test_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('qm.test_a')::uuid,'qm-fixture-a@example.invalid'),(current_setting('qm.test_b')::uuid,'qm-fixture-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qm.test_a'),'role','authenticated')::text,true);
select public.qm_load_workspace();
do $$ declare i integer; begin
  for i in 1..100 loop perform public.qm_upsert_key(null,'Fixture '||i,'fixture-key-'||i,true,i); end loop;
  if (select count(*) from public.qm_api_keys)<>100 then raise exception 'FAIL: expected 100'; end if;
  begin perform public.qm_upsert_key(null,'101','fixture-extra',true,101); raise exception 'FAIL: 101st allowed';
  exception when others then if sqlerrm not like '%Maksimal 100%' then raise; end if; end;
  begin perform public.qm_service_credential(current_setting('qm.test_a')::uuid,(select id from public.qm_api_keys limit 1)); raise exception 'FAIL: service RPC exposed';
  exception when insufficient_privilege then null; end;
  begin perform secret from private.qm_key_credentials; raise exception 'FAIL: plaintext readable';
  exception when insufficient_privilege then null; end;
  perform public.qm_save_workspace('{"draft":{"topic":"Account A"}}',0);
  begin perform public.qm_save_workspace('{}',0); raise exception 'FAIL: stale write allowed';
  exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qm.test_b'),'role','authenticated')::text,true);
select public.qm_load_workspace();
do $$ begin
  if (select count(*) from public.qm_api_keys)<>0 then raise exception 'FAIL: keys leaked into B'; end if;
  if exists(select 1 from public.qm_workspaces where user_id<>auth.uid()) then raise exception 'FAIL: workspace leak'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin perform public.qm_load_workspace(); raise exception 'FAIL: guest cloud access'; exception when insufficient_privilege then null; end;
  begin perform id from public.qm_api_keys; raise exception 'FAIL: guest metadata access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: 100-key limit, private credentials, service RPC denial, stale-write rejection, account isolation, guest denial' as verification;
rollback;

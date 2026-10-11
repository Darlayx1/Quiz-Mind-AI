-- Run in the affected project's Supabase SQL Editor with an administrator session.
-- Read-only: no application rows, credentials, or session tokens are returned.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '2s';

select jsonb_build_object(
  'checked_at', now(),
  'database', current_database(),
  'max_connections', current_setting('max_connections'),
  'current_connections', (select count(*) from pg_stat_activity where datname = current_database()),
  'active_connections', (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
  'idle_in_transaction', (select count(*) from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'),
  'workspace_table_exists', to_regclass('public.qm_workspaces') is not null,
  'key_table_exists', to_regclass('public.qm_api_keys') is not null,
  'load_function_exists', to_regprocedure('public.qm_load_workspace()') is not null,
  'authenticated_can_load', case when to_regprocedure('public.qm_load_workspace()') is not null then has_function_privilege('authenticated', 'public.qm_load_workspace()', 'EXECUTE') else false end,
  'load_function_definition', case when to_regprocedure('public.qm_load_workspace()') is not null then pg_get_functiondef(to_regprocedure('public.qm_load_workspace()')) else null end,
  'workspace_rls', (select relrowsecurity from pg_class where oid = to_regclass('public.qm_workspaces')),
  'keys_rls', (select relrowsecurity from pg_class where oid = to_regclass('public.qm_api_keys')),
  'policies', (select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'roles', roles, 'command', cmd, 'using', qual)), '[]'::jsonb) from pg_policies where schemaname = 'public' and tablename in ('qm_workspaces', 'qm_api_keys')),
  'waiting_or_long_transactions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'pid', pid, 'role', usename, 'application', application_name,
      'state', state, 'wait_type', wait_event_type, 'wait_event', wait_event,
      'transaction_age', now() - xact_start, 'query_age', now() - query_start,
      'blocked_by', pg_blocking_pids(pid)
    )), '[]'::jsonb)
    from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
      and (cardinality(pg_blocking_pids(pid)) > 0 or state = 'active' or xact_start < now() - interval '1 minute')
  )
) as account_storage_health;

rollback;

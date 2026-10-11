-- Run in the affected project's Supabase SQL Editor with an administrator session.
-- Read-only: no application rows, credentials, or session tokens are returned.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '2s';

select jsonb_build_object(
  'checked_at', now(),
  'database', current_database(),
  'transaction_read_only', current_setting('transaction_read_only'),
  'diagnostic_statement_timeout', current_setting('statement_timeout'),
  'diagnostic_lock_timeout', current_setting('lock_timeout'),
  'max_connections', current_setting('max_connections'),
  'reserved_superuser_connections', current_setting('superuser_reserved_connections'),
  'reserved_connections', current_setting('reserved_connections', true),
  'total_connections_all_databases', (select count(*) from pg_stat_activity),
  'current_connections', (select count(*) from pg_stat_activity where datname = current_database()),
  'active_connections', (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
  'idle_in_transaction', (select count(*) from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'),
  'workspace_table_exists', to_regclass('public.qm_workspaces') is not null,
  'key_table_exists', to_regclass('public.qm_api_keys') is not null,
  'load_function_exists', to_regprocedure('public.qm_load_workspace()') is not null,
  'authenticated_can_load', case when to_regprocedure('public.qm_load_workspace()') is not null then has_function_privilege('authenticated', 'public.qm_load_workspace()', 'EXECUTE') else false end,
  'authenticated_can_read_keys', case when to_regclass('public.qm_api_keys') is not null then has_table_privilege('authenticated', 'public.qm_api_keys', 'SELECT') else false end,
  'load_function_properties', (select jsonb_build_object('security_definer', prosecdef, 'volatility', provolatile, 'source_hash', md5(prosrc), 'contains_insert', prosrc ~* '\minsert\M', 'contains_for_update', prosrc ~* 'for\s+update') from pg_proc where oid = to_regprocedure('public.qm_load_workspace()')),
  'role_connection_counts', (select coalesce(jsonb_agg(row_data), '[]'::jsonb) from (select jsonb_build_object('role', usename, 'connections', count(*)) as row_data from pg_stat_activity where datname = current_database() group by usename) counts),
  -- Only allowlisted settings; never return arbitrary role configuration.
  -- These are saved settings, not proof of PostgREST's currently loaded config.
  'saved_role_database_settings', (
    select coalesce(jsonb_agg(jsonb_build_object('role', r.rolname, 'database', coalesce(d.datname, 'all databases'), 'setting', cfg)), '[]'::jsonb)
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    left join pg_database d on d.oid = s.setdatabase
    cross join lateral unnest(s.setconfig) cfg
    where r.rolname in ('anon', 'authenticated', 'authenticator', 'service_role')
      and (s.setdatabase = 0 or d.datname = current_database())
      and split_part(cfg, '=', 1) in ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'pgrst.db_pool', 'pgrst.db_pool_acquisition_timeout')
  ),
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
    from (select * from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
      and (cardinality(pg_blocking_pids(pid)) > 0 or state = 'active' or xact_start < now() - interval '1 minute')
    order by xact_start nulls last limit 50) activity
  )
) as account_storage_health;

rollback;

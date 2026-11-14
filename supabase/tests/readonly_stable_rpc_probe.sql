-- PostgREST runs STABLE and IMMUTABLE functions in a read-only transaction.
-- A row lock or write anywhere under such a function (for example
-- require_content_editor's SELECT ... FOR UPDATE) then fails only through the
-- API, as read_admin_platform_followers did on DEV on 2026-11-14.
-- Call every API-exposed STABLE/IMMUTABLE function in public once inside a
-- read-only transaction with placeholder arguments and fail on SQLSTATE 25006.
-- Other errors (permission guards, not found) are expected with empty data.
\set ON_ERROR_STOP 1
begin read only;
set local statement_timeout = '120s';
do $$
declare
  f record;
  probed int := 0;
  violations text := '';
  -- Measured 335 on the clean replay (2026-11-14); a drop far below means the selection broke.
  minimum_probed constant int := 320;
  started_at constant timestamptz := clock_timestamp();
begin
  for f in
    select p.oid::regprocedure::text as signature, p.proname,
      case
        when has_function_privilege('service_role', p.oid, 'execute') then 'service_role'
        when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated'
        else 'anon'
      end as api_role,
      (select string_agg(case
         when t = 'uuid'::regtype then '''00000000-0000-0000-0000-000000000000''::uuid'
         when t in ('text'::regtype, 'character varying'::regtype) then '''''::' || format_type(t, null)
         when t in ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype,
                    'numeric'::regtype, 'double precision'::regtype) then '0::' || format_type(t, null)
         when t = 'boolean'::regtype then 'false'
         when t in ('jsonb'::regtype, 'json'::regtype) then '''{}''::' || format_type(t, null)
         when t in ('timestamptz'::regtype, 'timestamp'::regtype, 'date'::regtype) then 'now()::' || format_type(t, null)
         when (select typcategory from pg_type where oid = t) = 'A' then '''{}''::' || format_type(t, null)
         else 'null::' || format_type(t, null)
       end, ', ' order by ord)
       from unnest(p.proargtypes::oid[]) with ordinality a(t, ord)
       where ord <= p.pronargs - p.pronargdefaults) as args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.provolatile in ('s', 'i')
      and p.prorettype <> 'trigger'::regtype
      and (has_function_privilege('service_role', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute'))
    order by 1
  loop
    probed := probed + 1;
    begin
      execute format('set local role %I', f.api_role);
      execute format('select public.%I(%s)', f.proname, coalesce(f.args, ''));
    exception
      when read_only_sql_transaction then
        violations := violations || format(E'\n  %s as %s: %s', f.signature, f.api_role, sqlerrm);
      when others then
        null;
    end;
    reset role;
  end loop;

  raise notice 'read-only probe called % STABLE/IMMUTABLE API functions in %', probed, clock_timestamp() - started_at;
  if violations <> '' then
    raise exception 'STABLE/IMMUTABLE functions that PostgREST cannot run read-only (make them VOLATILE):%', violations;
  end if;
  if probed < minimum_probed then
    raise exception 'read-only probe called only % functions (expected at least %)', probed, minimum_probed;
  end if;
end;
$$;
rollback;

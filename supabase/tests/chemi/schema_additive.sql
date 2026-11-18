-- Run before fixtures: ownership, access and empty tables.
do $$
declare bad text; n bigint; t record; owner text := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.app_users'::regclass);
  -- 라우트·유지 작업이 부르는 함수 전부(r4 profile_fn 뒤: 옛 프로필 3개는 빠지고 v2 가 든다. profile_guard 뒤: 상대 지우기는 v3 만).
  service_fns constant text[] := array['chemi_feature_state','chemi_read_profile','chemi_save_birth_v2','chemi_add_partner_v2',
    'chemi_update_partner_v2','chemi_delete_partner_v3','chemi_fp_salt','chemi_purge_ephemeral','chemi_purge_stale_partners',
    'chemi_withdraw_birth_consent','chemi_begin_account_deletion','chemi_complete_account_deletion',
    'chemi_claim_pending_points','chemi_complete_reading','chemi_save_reading','chemi_reading_context','chemi_share_done',
    'chemi_reading_detail','chemi_reading_list','chemi_rewards_today','chemi_visit','chemi_participation',
    'chemi_issue_play','chemi_refund_play','chemi_create_share','chemi_get_share',
    'chemi_mail_claim','chemi_mail_finish','chemi_reminder_set',
    'chemi_chain_work','chemi_chain_read','chemi_chain_metadata','chemi_chain_collect'];
begin
  select string_agg(c.relname||':'||pg_get_userbyid(c.relowner), ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relname like 'chemi\_%' and pg_get_userbyid(c.relowner)<>owner;
  if bad is not null then raise exception '2. owner not %: %', owner, bad; end if;
  select string_agg(p.proname||':'||pg_get_userbyid(p.proowner), ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and pg_get_userbyid(p.proowner)<>owner;
  if bad is not null then raise exception '2. function owner not %: %', owner, bad; end if;

  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%'
      and (not c.relrowsecurity or exists (select 1 from pg_policy where polrelid=c.oid)
        or has_table_privilege('anon', c.oid, 'select,insert,update,delete') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
        or has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
        or exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0));
  if bad is not null then raise exception '3. table access open: %', bad; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and (
      has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
      or has_function_privilege('service_role', p.oid, 'execute') <> (p.proname = any(service_fns)));
  if bad is not null then raise exception '4. function grants: %', bad; end if;

  for t in select c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%' loop
    execute format('select count(*) from public.%I', t.relname) into n;
    if n > 0 then raise exception '5. % has % seed rows', t.relname, n; end if;
  end loop;
end $$;

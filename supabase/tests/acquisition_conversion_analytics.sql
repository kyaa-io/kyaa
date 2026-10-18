\set ON_ERROR_STOP on
begin;

create function pg_temp.acquisition_check(p_condition boolean,p_message text) returns void
language plpgsql as $$ begin
  if p_condition is distinct from true then raise exception '%',p_message; end if;
end $$;
create function pg_temp.acquisition_expect_error(p_statement text,p_expected text) returns void
language plpgsql as $$ declare caught boolean := false; begin
  begin execute p_statement;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then raise exception 'Unexpected error: %',sqlerrm; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected error: %',p_expected; end if;
end $$;

do $$
declare
  admin_user uuid := '95700000-0000-4000-8000-000000000001';
  admin_allowlist uuid := '95700000-0000-4000-8000-000000000002';
  inactive_allowlist uuid := '95700000-0000-4000-8000-000000000003';
  v_user uuid;
  report jsonb;
  v_from timestamptz := date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC' - interval '6 days';
  original jsonb;
  replay jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_user,'did:privy:acquisition-admin','acquisition-admin@byus.test');
  insert into public.admin_allowlist(id,email,role,active) values
    (admin_allowlist,'acquisition-admin@byus.test','admin',true),
    (inactive_allowlist,'inactive-acquisition-admin@byus.test','admin',false);

  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,7);
  perform pg_temp.acquisition_check(report->'rows' = '[]'::jsonb and report#>>'{totals,acquisitions,value}' = '0','empty cohort must be measured zero');
  perform pg_temp.acquisition_check((report->>'from')::timestamptz = v_from,'7 days must include UTC today');
  for i in 1..5 loop
    v_user := ('95700000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid;
    insert into public.app_users(id,privy_user_id,verified_email) values(v_user,'did:privy:acquisition-'||i,'acquisition-'||i||'@byus.test');
    original := public.record_product_event_v1(1::smallint,'creator_page_view',v_user,null,null,null,null,null,
      'acquisition.identified_handoff','acquisition-fixture:'||i,statement_timestamp()-interval '3 hours',
      '{"channel":"search","landing":"benefit","attribution":"session_first_touch"}'::jsonb);
    replay := public.record_product_event_v1(1::smallint,'creator_page_view',v_user,null,null,null,null,null,
      'acquisition.identified_handoff','acquisition-fixture:'||i,statement_timestamp()-interval '3 hours',
      '{"channel":"search","landing":"benefit","attribution":"session_first_touch"}'::jsonb);
    perform pg_temp.acquisition_check((replay->>'replayed')::boolean and original->>'id' = replay->>'id','replay must retain one event');
    insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
      (1,'creator_page_view',v_user,'acquisition.session_landing','later-acquisition:'||i,statement_timestamp()-interval '2 hours','{"channel":"social","landing":"home"}'),
      (1,'account_created',v_user,'server.commit_projection','account-after:'||i,statement_timestamp()-interval '2 hours','{}'),
      (1,'profile_completed',v_user,'server.commit_projection','profile-before:'||i,statement_timestamp()-interval '4 hours','{}'),
      (1,'reservation_completed',v_user,'web.uncommitted','reservation-uncommitted:'||i,statement_timestamp()-interval '1 hour','{}'),
      (1,'benefit_entered',v_user,'server.commit_projection','benefit-after:'||i,statement_timestamp()-interval '1 hour','{}'),
      (1,'benefit_entered',v_user,'server.commit_projection','benefit-duplicate:'||i,statement_timestamp()-interval '30 minutes','{}'),
      (1,'profile_completed',v_user,'server.commit_projection','profile-future:'||i,statement_timestamp()+interval '1 hour','{}');
  end loop;
  -- A previous-window visit does not exclude a period cohort member.
  insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
    (1,'creator_page_view','95700000-0000-4000-8000-000000000101','acquisition.session_landing','prior-window-acquisition',v_from-interval '1 microsecond','{"channel":"direct","landing":"home"}');
  insert into public.fan_product_events(schema_version,event_name,anonymous_session_hash,source,idempotency_key,occurred_at,properties) values
    (1,'creator_page_view',repeat('e',64),'acquisition.session_landing','anonymous-acquisition',statement_timestamp()-interval '4 hours','{"channel":"social","landing":"home"}');

  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,7);
  perform pg_temp.acquisition_check(jsonb_array_length(report->'rows') = 1,'only earliest identified period touch contributes');
  perform pg_temp.acquisition_check(report#>>'{rows,0,channel}' = 'search' and report#>>'{rows,0,landing}' = 'benefit','safe dimensions and first-touch grouping');
  perform pg_temp.acquisition_check(report#>>'{totals,acquisitions,value}' = '5','deduplicated period cohort, including prior visitors');
  perform pg_temp.acquisition_check(report#>>'{totals,accountCreated,value}' = '5','committed account creation after acquisition');
  perform pg_temp.acquisition_check(report#>>'{totals,profileCompleted,value}' = '0','exclude earlier and future conversions');
  perform pg_temp.acquisition_check(report#>>'{totals,reservationCompleted,value}' = '0','exclude uncommitted conversions');
  perform pg_temp.acquisition_check(report#>>'{totals,benefitEntered,value}' = '5','benefits counted independently without passport, profile or reservation');
  perform pg_temp.acquisition_check(report::text !~ 'app_user_id|anonymous|95700000|referrer|https?://','report must not contain identity or raw URLs');

  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,30);
  perform pg_temp.acquisition_check(jsonb_array_length(report->'rows') = 2 and report#>>'{rows,0,channel}' = 'direct','30-day period includes earlier acquisition');
  perform pg_temp.acquisition_check((report->>'from')::timestamptz = date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC' - interval '29 days','30-day UTC boundary');
  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,90);
  perform pg_temp.acquisition_check((report->>'from')::timestamptz = date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC' - interval '89 days','90-day UTC boundary');

  -- Invalid dimensions and source cannot leak into grouped output.
  v_user := '95700000-0000-4000-8000-000000000106';
  insert into public.app_users(id,privy_user_id,verified_email) values(v_user,'did:privy:acquisition-unsafe','acquisition-unsafe@byus.test');
  insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
    (1,'creator_page_view',v_user,'acquisition.session_landing','unsafe-channel-fixture',statement_timestamp()-interval '3 hours','{"channel":"private.example","landing":"benefit"}'),
    (1,'creator_page_view',v_user,'acquisition.session_landing','unsafe-landing-fixture',statement_timestamp()-interval '3 hours','{"channel":"search","landing":"/private/path"}'),
    (1,'creator_page_view',v_user,'web.other','unsafe-source-fixture',statement_timestamp()-interval '3 hours','{"channel":"search","landing":"home"}');
  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,7);
  perform pg_temp.acquisition_check(report#>>'{totals,acquisitions,value}' = '5','unsafe dimensions excluded');

  -- One extra small group hides the total too, preventing subtraction attacks.
  insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
    (1,'creator_page_view',v_user,'acquisition.session_landing','small-cohort-fixture',statement_timestamp()-interval '2 hours','{"channel":"social","landing":"home"}');
  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,7);
  perform pg_temp.acquisition_check(report#>>'{rows,1,acquisitions,state}' = 'suppressed' and report#>'{rows,1,acquisitions,value}' = 'null'::jsonb,'small group hidden');
  perform pg_temp.acquisition_check(report#>>'{totals,acquisitions,state}' = 'suppressed' and report#>'{totals,acquisitions,value}' = 'null'::jsonb,'complementary total hidden');
  perform pg_temp.acquisition_check(report#>>'{totals,benefitEntered,value}' = '5','independent safe metrics stay visible');

  -- The lower UTC boundary is inclusive, while the previous microsecond above was excluded.
  insert into public.fan_product_events(schema_version,event_name,app_user_id,source,idempotency_key,occurred_at,properties) values
    (1,'creator_page_view','95700000-0000-4000-8000-000000000101','acquisition.session_landing','exact-window-boundary',v_from,'{"channel":"email","landing":"home"}');
  report := public.read_admin_acquisition_analytics(admin_user,admin_allowlist,7);
  perform pg_temp.acquisition_check(jsonb_array_length(report->'rows') = 3 and report#>>'{rows,0,channel}' = 'email','UTC lower boundary must be inclusive');

  perform pg_temp.acquisition_expect_error(format('select public.read_admin_acquisition_analytics(%L,%L,8)',admin_user,admin_allowlist),'ACQUISITION_ANALYTICS_INVALID_DAYS');
  perform pg_temp.acquisition_expect_error(format('select public.read_admin_acquisition_analytics(%L,%L,null)',admin_user,admin_allowlist),'ACQUISITION_ANALYTICS_INVALID_DAYS');
  perform pg_temp.acquisition_expect_error(format('select public.read_admin_acquisition_analytics(%L,%L,7)',v_user,admin_allowlist),'active admin required');
  perform pg_temp.acquisition_expect_error(format('select public.read_admin_acquisition_analytics(%L,%L,7)',admin_user,inactive_allowlist),'active admin required');
  perform pg_temp.acquisition_check(not has_function_privilege('anon','public.read_admin_acquisition_analytics(uuid,uuid,integer)','execute') and not has_function_privilege('authenticated','public.read_admin_acquisition_analytics(uuid,uuid,integer)','execute') and has_function_privilege('service_role','public.read_admin_acquisition_analytics(uuid,uuid,integer)','execute'),'RPC role grants');
  perform pg_temp.acquisition_check(not has_table_privilege('service_role','public.fan_product_events','select'),'ledger remains inaccessible to service_role');
  perform pg_temp.acquisition_check((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.read_admin_acquisition_analytics(uuid,uuid,integer)'::regprocedure),'definer uses empty search path');
end $$;

set local role service_role;
select public.read_admin_acquisition_analytics('95700000-0000-4000-8000-000000000001','95700000-0000-4000-8000-000000000002',7) is not null as service_role_aggregate_allowed;
reset role;
rollback;

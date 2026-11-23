-- Disposable clean-chain DB only; all fixture changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.limit_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin execute p_sql; raise exception 'missing error %',p_expected;
exception when others then if sqlerrm='missing error '||p_expected or position(p_expected in sqlerrm)=0 then raise; end if; end $$;
do $$
declare a uuid:='dc270000-0000-4000-8000-000000000001';b uuid:='dc270000-0000-4000-8000-000000000002';g text:=repeat('f',64);i integer;
begin
  if current_database()<>'byus_clean' then raise exception 'disposable database required';end if;
  -- Service-only settings and alerts.
  if has_table_privilege('anon','public.translation_limits','select') or has_table_privilege('authenticated','public.translation_limits','select')
    or has_table_privilege('authenticated','public.translation_limits','update') or has_table_privilege('anon','public.translation_limit_alerts','select')
    or has_table_privilege('authenticated','public.translation_limit_alerts','select')
    or has_function_privilege('anon','public.record_translation_limit_block(integer)','execute') or has_function_privilege('authenticated','public.record_translation_limit_block(integer)','execute')
    or has_function_privilege('service_role','public.check_display_translation_budget(uuid,text,integer)','execute') then raise exception 'translation limit ACL leak';end if;
  if not has_table_privilege('service_role','public.translation_limits','update') or has_table_privilege('service_role','public.translation_limits','insert')
    or has_table_privilege('service_role','public.translation_limits','delete') or has_table_privilege('service_role','public.translation_limit_alerts','insert')
    or not has_function_privilege('service_role','public.record_translation_limit_block(integer)','execute') then raise exception 'service role translation limit grants wrong';end if;
  if not (select relrowsecurity from pg_class where oid='public.translation_limits'::regclass) or not (select relrowsecurity from pg_class where oid='public.translation_limit_alerts'::regclass) then raise exception 'RLS disabled';end if;
  if (select count(*) from public.translation_limits)<>1 then raise exception 'settings must be one row';end if;
  -- Settings row as shipped (verify-display-translation-concurrency may have pinned older values earlier in this disposable DB).
  update public.translation_limits set user_requests_per_minute=20,user_daily_characters=30000,service_daily_characters=300000,service_monthly_characters=3000000,alert_percent=80;
  perform pg_temp.limit_error('update public.translation_limits set service_daily_characters=4000000','translation_limits_check');

  insert into public.app_users(id,privy_user_id,verified_email) values(a,'did:privy:translation-limit-a','limit-a@byus.test'),(b,'did:privy:translation-limit-b','limit-b@byus.test');
  delete from public.content_translation_requests;delete from public.display_translation_requests;delete from public.translation_limit_alerts;
  -- New values pass where the old constants (10,000 per user per day) refused, and the user day still ends at 30,000.
  perform public.reserve_display_translation_request(a,repeat('a',64),20000);
  perform public.reserve_content_translation_request(a,10000);
  perform pg_temp.limit_error(format('select public.reserve_content_translation_request(%L,1)',a),'TRANSLATION_RATE_LIMITED');
  perform pg_temp.limit_error(format('select public.reserve_display_translation_request(%L,%L,1)',a,repeat('a',64)),'TRANSLATION_RATE_LIMITED');
  -- 20 requests a minute per requester, the 21st is refused.
  for i in 1..20 loop perform public.reserve_display_translation_request(null,g,1);end loop;
  perform pg_temp.limit_error(format('select public.reserve_display_translation_request(null,%L,1)',g),'TRANSLATION_RATE_LIMITED');
  -- A settings edit applies to the very next reservation.
  update public.translation_limits set user_requests_per_minute=21;
  perform public.reserve_display_translation_request(null,g,1);
  perform pg_temp.limit_error(format('select public.reserve_display_translation_request(null,%L,1)',g),'TRANSLATION_RATE_LIMITED');

  -- Service day: 30,021 used. Warning at 80% of 37,000 = 29,600 was crossed by the next accepted request only.
  delete from public.translation_limit_alerts;
  update public.translation_limits set service_daily_characters=37000;
  if exists(select 1 from public.translation_limit_alerts) then raise exception 'alert before any request';end if;
  perform public.reserve_display_translation_request(b,repeat('b',64),5000);
  if (select count(*) from public.translation_limit_alerts where kind='day_warning' and limit_characters=37000 and used_characters=35021)<>1 then raise exception 'day warning missing';end if;
  perform public.reserve_display_translation_request(b,repeat('b',64),1000);
  if (select count(*) from public.translation_limit_alerts where kind='day_warning')<>1 then raise exception 'day warning repeated';end if;
  perform pg_temp.limit_error(format('select public.reserve_display_translation_request(%L,%L,5000)',b,repeat('b',64)),'TRANSLATION_RATE_LIMITED');
  if exists(select 1 from public.translation_limit_alerts where kind='day_exhausted') then raise exception 'refused request must not commit an alert by itself';end if;
  perform public.record_translation_limit_block(5000);
  perform public.record_translation_limit_block(5000);
  if (select count(*) from public.translation_limit_alerts where kind='day_exhausted' and limit_characters=37000 and used_characters=36021)<>1 then raise exception 'day exhausted alert must be recorded once';end if;
  if exists(select 1 from public.translation_limit_alerts where kind like 'month%') then raise exception 'month alert without month pressure';end if;
  -- Raising the limit lets the same request through and re-arms alerts for the new limit.
  update public.translation_limits set service_daily_characters=300000;
  perform public.reserve_display_translation_request(b,repeat('b',64),5000);
  -- Service month.
  update public.translation_limits set service_daily_characters=50000,service_monthly_characters=50000;
  perform public.reserve_content_translation_request(b,1);
  if (select count(*) from public.translation_limit_alerts where kind='month_warning' and limit_characters=50000)<>1 then raise exception 'month warning missing';end if;
  perform pg_temp.limit_error(format('select public.reserve_content_translation_request(%L,10000)',b),'TRANSLATION_RATE_LIMITED');
  perform public.record_translation_limit_block(10000);
  if (select count(*) from public.translation_limit_alerts where kind='month_exhausted' and limit_characters=50000)<>1 then raise exception 'month exhausted alert missing';end if;
  if (select count(*) from public.translation_limit_alerts where kind='day_exhausted' and limit_characters=37000)<>1 then raise exception 'old day alert lost';end if;
  perform pg_temp.limit_error('select public.record_translation_limit_block(0)','TRANSLATION_INVALID_INPUT');
  -- A missing settings row refuses instead of lifting every limit.
  delete from public.translation_limits;
  perform pg_temp.limit_error(format('select public.reserve_display_translation_request(null,%L,1)',repeat('c',64)),'TRANSLATION_RATE_LIMITED');
  perform public.record_translation_limit_block(1);
  raise notice 'TRANSLATION_LIMITS_PASS service-only settings/alerts, new limits pass and refuse, row edits apply at once, warning/exhausted alerts once per limit, missing row refuses';
end $$;
rollback;

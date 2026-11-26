-- ATTRIBUTION-EVERYWHERE-1126 (20270116060000): the visit cookies are kept once for an account created in the last hour,
-- never back-filled onto an older member; the path labels; the admin report shape, KST hours and the admin check.
-- Local or disposable database only (loopback or Unix socket); everything rolls back.
do $$ begin if inet_server_addr() is not null and not inet_server_addr() << '127.0.0.0/8'::inet then
  raise exception 'Local database required'; end if; end $$;
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'MEMBER_ACQUISITION_TOUCHES_TEST: %', label; end if; end $$;

do $$
declare
  fresh uuid := 'a77a0000-0000-4000-8000-000000000001'; old uuid; admin_user uuid; allowlist uuid; r jsonb;
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (fresh, 'did:privy:attr-test-new', 'attr-test-new@example.com');
  select id into old from public.app_users where created_at < now() - interval '2 hours' order by created_at limit 1;
  perform pg_temp.assert(old is not null, 'fixture old member');

  perform pg_temp.assert(public.record_app_user_acquisition_touch(fresh,
    '{"src":"x","med":"kol","cmp":"alina","app":"x","lp":"/s/raffle","at":"2026-11-26T10:00:00.000Z"}',
    '{"src":"email","med":"email","cmp":"raffle_mail","app":"browser","via":"x","lp":"/","at":"2026-11-26T10:05:00.000Z"}'), 'new member recorded');
  perform pg_temp.assert(not public.record_app_user_acquisition_touch(fresh, '{"src":"other","app":"browser","lp":"/","at":"2026-11-26T11:00:00.000Z"}', null), 'second call ignored');
  perform pg_temp.assert((select first_touch->>'cmp' = 'alina' and last_touch->>'via' = 'x' from public.app_user_acquisition_touches where app_user_id = fresh), 'first and latest kept');
  perform pg_temp.assert(not public.record_app_user_acquisition_touch(old, '{"src":"x","app":"browser","lp":"/","at":"2026-11-26T10:00:00.000Z"}', null), 'old member not back-filled');
  begin
    perform public.record_app_user_acquisition_touch(fresh, '"text"', null);
    perform pg_temp.assert(false, 'non-object refused');
  exception when sqlstate '22023' then null;
  end;

  perform pg_temp.assert(public.acquisition_touch_path(null) = 'no_cookie', 'no cookie');
  perform pg_temp.assert(public.acquisition_touch_path('{"app":"browser"}') = 'direct', 'direct');
  perform pg_temp.assert(public.acquisition_touch_path('{"rh":"www.instagram.com","app":"instagram"}') = 'site: instagram.com', 'site');
  perform pg_temp.assert(public.acquisition_touch_path('{"ref":"ABC","app":"browser"}') = 'invite', 'invite');
  perform pg_temp.assert(public.acquisition_touch_path('{"clk":"twclid","app":"x"}') = 'ad click: twclid', 'ad click');
  perform pg_temp.assert(public.acquisition_touch_path('{"src":"x","med":"kol","cmp":"alina"}') = 'x / kol / alina', 'tags');

  select a.id, u.id into allowlist, admin_user from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
    where a.active and u.status = 'active' limit 1;
  if admin_user is not null then
    r := public.read_admin_signup_touches(admin_user, allowlist, 7);
    perform pg_temp.assert(jsonb_array_length(r->'hourly') = 24, '24 hours');
    perform pg_temp.assert(r->'paths' @> '[{"label":"x / kol / alina"}]' and r->'apps' @> '[{"label":"x"}]', 'new member counted by path and app');
    perform pg_temp.assert((select sum((h->>'signups')::int) from jsonb_array_elements(r->'hourly') h) = (r->>'total')::int, 'hours add up');
    begin
      perform public.read_admin_signup_touches(fresh, allowlist, 7);
      perform pg_temp.assert(false, 'non-admin refused');
    exception when others then if sqlerrm not like '%active admin required%' then raise; end if;
    end;
  end if;

  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.record_app_user_acquisition_touch(uuid,jsonb,jsonb)', 'execute'), 'record is server only');
  perform pg_temp.assert(not has_function_privilege('anon', 'public.read_admin_signup_touches(uuid,uuid,integer)', 'execute'), 'report is server only');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.app_user_acquisition_touches', 'select'), 'table is server only');
end $$;

select 'MEMBER_ACQUISITION_TOUCHES_TEST PASS';
rollback;

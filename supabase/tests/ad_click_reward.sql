-- AD-CLICK-REWARD-1126 (20270116050101): record_ad_click_reward pays 5 once per banner per KST day, 10 a day over every ad reward
-- (ad_video counted too), nothing for a draft or non-ad banner, the today read and the report view.
-- Local or disposable database only (loopback or Unix socket); everything rolls back.
do $$ begin if inet_server_addr() is not null and not inet_server_addr() << '127.0.0.0/8'::inet then
  raise exception 'Local database required'; end if; end $$;
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'AD_CLICK_REWARD_TEST: %', label; end if; end $$;

do $$
declare
  today date := public.dukjil_kst_date(public.dukjil_now());
  a uuid; b uuid; ads uuid[] := '{}'; id uuid; plain uuid; draft uuid; mid uuid; r jsonb; t jsonb; i integer; balance_before bigint;
begin
  select array_agg(u) into ads from (select u.id u from public.app_users u
    where public.dukjil_b3_payable(u.id)
      and not exists(select 1 from public.dukjil_action_log l where l.app_user_id = u.id and l.action_key in ('ad_click', 'ad_video'))
    order by u.id limit 2) picked;
  perform pg_temp.assert(cardinality(ads) = 2, 'fixture members');
  a := ads[1]; b := ads[2]; ads := '{}';
  balance_before := public.group_wallet_balance(a, 'fan_point');

  -- Eleven published ad banners, one published non-ad banner, one draft ad, one non-ad banner in the home_mid ad slot.
  for i in 1..11 loop
    insert into public.home_banners(kind, publication_status, placement, category) values ('announcement', 'published', 'home', 'ad') returning home_banners.id into id;
    ads := ads || id;
  end loop;
  insert into public.home_banners(kind, publication_status, placement, category) values ('announcement', 'published', 'home', 'announcement') returning home_banners.id into plain;
  insert into public.home_banners(kind, publication_status, placement, category) values ('announcement', 'draft', 'home', 'ad') returning home_banners.id into draft;
  insert into public.home_banners(kind, publication_status, placement, category) values ('announcement', 'published', 'home_mid', 'event') returning home_banners.id into mid;

  t := public.read_ad_click_rewards_today(a);
  perform pg_temp.assert((t ->> 'remaining')::integer = 10 and t -> 'claimed' = '[]'::jsonb and (t ->> 'points')::integer = 5, 'empty today read');

  r := public.record_ad_click_reward(a, ads[1]);
  perform pg_temp.assert((r ->> 'points')::integer = 5 and not (r ->> 'replayed')::boolean, 'first click pays 5');
  perform pg_temp.assert(public.group_wallet_balance(a, 'fan_point') = balance_before + 5, 'wallet +5');
  r := public.record_ad_click_reward(a, ads[1]);
  perform pg_temp.assert((r ->> 'points')::integer = 5 and (r ->> 'replayed')::boolean, 'second click replays');
  perform pg_temp.assert(public.group_wallet_balance(a, 'fan_point') = balance_before + 5, 'replay pays nothing');

  r := public.record_ad_click_reward(a, plain);
  perform pg_temp.assert((r ->> 'points')::integer = 0 and r ->> 'reason' = 'AD_NOT_FOUND', 'non-ad banner pays nothing');
  r := public.record_ad_click_reward(a, draft);
  perform pg_temp.assert((r ->> 'points')::integer = 0 and r ->> 'reason' = 'AD_NOT_FOUND', 'draft ad pays nothing');
  r := public.record_ad_click_reward(a, extensions.gen_random_uuid());
  perform pg_temp.assert(r ->> 'reason' = 'AD_NOT_FOUND', 'unknown banner pays nothing');
  r := public.record_ad_click_reward(a, mid);
  perform pg_temp.assert((r ->> 'points')::integer = 5, 'home_mid slot pays');

  -- 2 paid so far (ads[1], mid). A rewarded video row counts toward the same 10.
  insert into public.dukjil_action_log(app_user_id, action_key, source_key, request_key, points, policy_version, kst_date)
    values (a, 'ad_video', 'test-video', extensions.gen_random_uuid(), 5, 1, today);
  for i in 2..8 loop
    r := public.record_ad_click_reward(a, ads[i]);
    perform pg_temp.assert((r ->> 'points')::integer = 5, 'click ' || i || ' pays');
  end loop;
  r := public.record_ad_click_reward(a, ads[9]);
  perform pg_temp.assert((r ->> 'points')::integer = 0 and (r ->> 'capped')::boolean and r ->> 'reason' = 'POINT_CAP', '11th reward is capped');
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log l where l.app_user_id = a and l.source_key like 'ad:' || ads[9]::text || ':%'), 'cap writes nothing');
  perform pg_temp.assert(public.group_wallet_balance(a, 'fan_point') = balance_before + 45, 'nine clicks paid 45');

  t := public.read_ad_click_rewards_today(a);
  perform pg_temp.assert((t ->> 'remaining')::integer = 0 and jsonb_array_length(t -> 'claimed') = 9 and t -> 'claimed' ? ads[1]::text and t -> 'claimed' ? mid::text, 'today read after cap');

  -- Another member is not limited by a.
  r := public.record_ad_click_reward(b, ads[1]);
  perform pg_temp.assert((r ->> 'points')::integer = 5, 'second member pays');

  perform pg_temp.assert((select reward_clicks from public.ad_reward_click_daily v where v.banner_id = ads[1] and v.kst_date = today) = 2
    and (select rewarded_members from public.ad_reward_click_daily v where v.banner_id = ads[1] and v.kst_date = today) = 2, 'report view counts reward clicks');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.ad_reward_click_daily', 'select')
    and not has_table_privilege('authenticated', 'public.ad_reward_click_daily', 'select'), 'report view is server only');
  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.record_ad_click_reward(uuid,uuid)', 'execute'), 'rpc is server only');
end $$;

select 'AD_CLICK_REWARD_TEST PASS';
rollback;

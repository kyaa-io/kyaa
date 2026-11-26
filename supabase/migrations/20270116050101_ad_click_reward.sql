-- AD-CLICK-REWARD-1126: a signed-in member who clicks one of our ad banners earns 5 mileage (plan decisions 9 and 10).
--
-- record_ad_click_reward(actor, banner) reads the banner itself: it pays only for a published banner of the category 'ad' or one
-- placed in the home_mid slot (the admin's "external ad" slot). The caller names the banner, never the amount or the limits.
--   once per banner per member per KST day   dukjil_action_log unique (app_user_id, action_key, source_key), source 'ad:<banner>:<day>'
--   10 a KST day over every ad reward         counted over AD_REWARD_KEYS: 'ad_click' now, 'ad_video' when the rewarded video ad
--                                              is approved (plan A: the two roads share the 10)
--   repeated clicks                           the wallet lock and the unique key turn a second click into a replay of the first row
-- A refusal answers points 0 with a reason and writes nothing. The anonymous outbound_link_click stays as it is: this is a separate,
-- signed-in record (plan line 54), and ad_reward_click_daily counts it apart for the advertiser report ("reward clicks").
-- Rows go to dukjil_action_log (action 'ad_click', target 'banner:<id>') and the wallet as 'dukjil_action', like record_social_earn.
-- Rollback: supabase/rollback/20270116041100_ad_click_reward.sql
begin;
set local lock_timeout = '5s';

create function public.record_ad_click_reward(p_actor uuid, p_banner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ad_reward_keys constant text[] := array['ad_click', 'ad_video'];
  v_now timestamptz := public.dukjil_now(); today date := public.dukjil_kst_date(public.dukjil_now());
  pol public.dukjil_policy_versions; prior public.dukjil_action_log;
  v_key text; log_id uuid := extensions.gen_random_uuid(); entry uuid;
begin
  if p_actor is null or p_banner is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  if not exists(select 1 from public.home_banners b where b.id = p_banner and b.publication_status = 'published'
      and (b.category = 'ad' or b.placement = 'home_mid')) then
    return jsonb_build_object('points', 0, 'capped', false, 'reason', 'AD_NOT_FOUND', 'replayed', false);
  end if;
  if not public.dukjil_b3_payable(p_actor) then
    return jsonb_build_object('points', 0, 'capped', false, 'reason', 'ACCOUNT_INACTIVE', 'replayed', false);
  end if;

  perform public.group_wallet_lock(p_actor);
  v_key := 'ad:' || p_banner::text || ':' || today::text;
  select * into prior from public.dukjil_action_log l where l.app_user_id = p_actor and l.action_key = 'ad_click' and l.source_key = v_key;
  if found then
    return jsonb_build_object('points', prior.points, 'capped', prior.capped, 'reason', prior.reason, 'replayed', true);
  end if;
  pol := public.dukjil_active_policy(v_now);
  if pol.version is null then
    return jsonb_build_object('points', 0, 'capped', false, 'reason', 'POLICY_INACTIVE', 'replayed', false);
  end if;
  if (select count(*) from public.dukjil_action_log l
      where l.app_user_id = p_actor and l.action_key = any(ad_reward_keys) and l.kst_date = today and l.points > 0) >= 10 then
    return jsonb_build_object('points', 0, 'capped', true, 'reason', 'POINT_CAP', 'replayed', false);
  end if;

  entry := public.group_wallet_post(p_actor, 'fan_point', 5::bigint, 'dukjil_action', log_id);
  insert into public.dukjil_action_log(id, app_user_id, celebrity_id, action_key, source_key, request_key, points,
      stamp_id, ledger_id, capped, reason, policy_version, kst_date, target_key)
    values (log_id, p_actor, null, 'ad_click', v_key, log_id, 5, null, entry, false, null, pol.version, today, 'banner:' || p_banner::text);
  return jsonb_build_object('points', 5, 'capped', false, 'reason', null, 'replayed', false);
end $$;

-- Today's ad rewards of one member: the banners already paid (shown as done) and what is left of the shared 10.
create function public.read_ad_click_rewards_today(p_actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with paid as (
    select l.action_key, l.target_key from public.dukjil_action_log l
    where l.app_user_id = p_actor and l.action_key in ('ad_click', 'ad_video') and l.points > 0
      and l.kst_date = public.dukjil_kst_date(public.dukjil_now()))
  select jsonb_build_object(
    'kstDate', public.dukjil_kst_date(public.dukjil_now()),
    'points', 5, 'dailyLimit', 10,
    'remaining', greatest(10 - (select count(*) from paid), 0),
    'claimed', coalesce((select jsonb_agg(substr(p.target_key, 8) order by p.target_key) from paid p where p.action_key = 'ad_click'), '[]'::jsonb))
$$;

revoke all on function public.record_ad_click_reward(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_ad_click_reward(uuid, uuid) to service_role;
revoke all on function public.read_ad_click_rewards_today(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_ad_click_rewards_today(uuid) to service_role;

do $$ begin
  perform public.b3_owner_execute('public.record_ad_click_reward(uuid,uuid)', array[
    'public.dukjil_now()', 'public.dukjil_kst_date(timestamptz)', 'public.dukjil_b3_payable(uuid)', 'public.group_wallet_lock(uuid,boolean)',
    'public.dukjil_active_policy(timestamptz)', 'public.group_wallet_post(uuid,text,bigint,text,uuid)']);
  perform public.b3_owner_access('public.record_ad_click_reward(uuid,uuid)', array['home_banners:select', 'dukjil_action_log:select,insert']);
  perform public.b3_owner_execute('public.read_ad_click_rewards_today(uuid)', array['public.dukjil_now()', 'public.dukjil_kst_date(timestamptz)']);
  perform public.b3_owner_access('public.read_ad_click_rewards_today(uuid)', array['dukjil_action_log:select']);
end $$;

-- Advertiser report: reward clicks per banner and KST day, apart from the anonymous outbound clicks. Server-side reads only.
create view public.ad_reward_click_daily as
  select substr(l.target_key, 8)::uuid as banner_id, l.kst_date, count(*) as reward_clicks,
    count(distinct l.app_user_id) as rewarded_members, sum(l.points) as points
  from public.dukjil_action_log l
  where l.action_key = 'ad_click' and l.points > 0
  group by 1, 2;
revoke all on public.ad_reward_click_daily from public, anon, authenticated;
grant select on public.ad_reward_click_daily to service_role;

notify pgrst, 'reload schema';
commit;

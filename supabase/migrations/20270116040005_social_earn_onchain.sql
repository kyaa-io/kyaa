-- EARN-SOCIAL-ONCHAIN-1126: friend added and chat now leave a stamp on chain too, and no social stamp speeds up the grade.
--
-- 1. On chain. record_social_earn (20270116040003) paid friend_add and chat on the ledger only: they have no creator page. The creator
--    is now the actor's favorite (fan_profile_public_fields.favorite_celebrity_id, the one favorite of the app; for friend_add the
--    requester who is paid), only while that creator is published and the actor holds the passport, like the like and reply stamps.
--    No favorite, or no passport for it: the point is still paid and no stamp is issued. The stamp kinds social_friend and social_chat
--    take chain code 12 with the other creator stamps, so the contract (ByUsActionHub) and its creator-stamp rule are unchanged.
--    At most one stamp of a kind per creator per KST day (same rule as like and reply), so the 5 friend and 20 chat points a day
--    become at most one stamp each.
-- 2. Grade. The only stamp-based grade path in this schema is the passport slot count (silver-1 at 3 filled slots, silver-2 at 6:
--    passport_v3_tier, get_fan_passport_stage, get_fan_passport_stage_progress). Policy 4 (stamp totals) has its thresholds published
--    but no function that counts stamps yet and is not active. community_stamp_counts_for_tier is the one list of stamps that must not
--    count: the four social kinds (the like and reply stamps are 'reaction' and 'comment' kinds with a 'social:' source key).
--    passport_place_stamp, the single choke point that fills slots for every issuer, skips them. A future stamp-total grade must
--    count only stamps for which this function is true.
-- Rollback: supabase/rollback/20270116040005_social_earn_onchain.sql
begin;
set local lock_timeout = '5s';

create function public.community_stamp_counts_for_tier(p_kind public.community_stamp_kind, p_source_key text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select not (p_kind::text in ('social_friend', 'social_chat') or coalesce(p_source_key, '') like 'social:%')
$$;
revoke all on function public.community_stamp_counts_for_tier(public.community_stamp_kind, text) from public, anon, authenticated, service_role;

create function public.social_earn_favorite(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.favorite_celebrity_id from public.fan_profile_public_fields f
    join public.celebrities c on c.id = f.favorite_celebrity_id and c.status = 'published' and c.archived_at is null
    where f.app_user_id = p_user
      and exists(select 1 from public.fan_passports fp where fp.app_user_id = p_user and fp.celebrity_id = f.favorite_celebrity_id)
$$;
revoke all on function public.social_earn_favorite(uuid) from public, anon, authenticated, service_role;

-- Source gate: the two kinds are accepted while an active dukjil policy is in force, like the other dukjil kinds.
do $$
declare definition text; anchor text := $a$'wave_mission','first_clip'])$a$;
begin
  definition := pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
  if position('social_friend' in definition) > 0 then return; end if;
  if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
    raise exception 'SOCIAL_EARN_SOURCE_GATE_PATCH_DRIFT'; end if;
  execute replace(definition, anchor, $r$'wave_mission','first_clip','social_friend','social_chat'])$r$);
end $$;

-- Chain code: the new kinds are creator stamps, code 12.
create or replace function public.community_stamp_onchain_code(p_kind public.community_stamp_kind, p_celebrity uuid) returns integer
language sql immutable set search_path = '' as $$
  select case when p_celebrity is null then null
    when p_kind = 'daily_checkin' then 10
    when p_kind = 'first_comment' then 8
    when p_kind::text = any(array['post','comment','reaction','live_reserve','live_attend','survey','mission','event_checkin',
      'event_review','cheer','proof','quiz','steady_checkin','subscription','share','social_friend','social_chat']) then 12 end
$$;

-- Slot placement: a stamp that does not count for the grade never fills a passport slot.
do $$
declare definition text;
  anchor text := $a$  if p_user is null or p_celebrity is null or p_stamp is null or p_kind is null then return; end if;
$a$;
begin
  definition := pg_get_functiondef('public.passport_place_stamp(uuid,uuid,uuid,public.community_stamp_kind)'::regprocedure);
  if position('community_stamp_counts_for_tier' in definition) > 0 then return; end if;
  if length(definition) - length(replace(definition, anchor, '')) <> length(anchor) then
    raise exception 'SOCIAL_EARN_PLACE_STAMP_PATCH_DRIFT'; end if;
  execute replace(definition, anchor, anchor || $r$  if not public.community_stamp_counts_for_tier(p_kind, (select s.source_key from public.community_stamps s where s.id = p_stamp)) then return; end if;
$r$);
end $$;

create or replace function public.record_social_earn(p_actor uuid, p_action text, p_source uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := public.dukjil_now(); today date := public.dukjil_kst_date(public.dukjil_now()); day_start timestamptz;
  pol public.dukjil_policy_versions; prior public.dukjil_action_log;
  v_user uuid; v_other uuid; v_celebrity uuid; v_parent uuid; v_conversation uuid;
  v_key text; v_target text; v_cap integer; v_kind public.community_stamp_kind; v_reason text;
  log_id uuid := extensions.gen_random_uuid(); stamp uuid; entry uuid;
begin
  if p_actor is null or p_action is null or p_source is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  if p_action = 'comment_like' then
    select c.app_user_id, p.celebrity_id into v_other, v_celebrity
      from public.mobile_content_comment_reactions r
      join public.fan_post_comments c on c.id = r.target_id
      join public.fan_posts p on p.id = c.post_id
      where r.target_type = 'fan_post_comment' and r.target_id = p_source and r.app_user_id = p_actor
        and c.deleted_at is null and c.hidden_at is null and p.deleted_at is null and p.hidden_at is null;
    if not found then v_reason := 'SOCIAL_EARN_NOT_FOUND'; elsif v_other = p_actor then v_reason := 'SELF_ACTION'; end if;
    v_user := p_actor; v_key := 'comment-like:' || p_source::text; v_cap := 20; v_kind := 'reaction';
  elsif p_action = 'comment_reply' then
    select c.parent_id, parent.app_user_id, p.celebrity_id into v_parent, v_other, v_celebrity
      from public.fan_post_comments c
      join public.fan_post_comments parent on parent.id = c.parent_id
      join public.fan_posts p on p.id = c.post_id
      where c.id = p_source and c.app_user_id = p_actor
        and c.deleted_at is null and c.hidden_at is null and p.deleted_at is null and p.hidden_at is null;
    if not found then v_reason := 'SOCIAL_EARN_NOT_FOUND'; elsif v_other = p_actor then v_reason := 'SELF_ACTION';
    elsif exists(select 1 from public.dukjil_action_log l where l.app_user_id = p_actor and l.action_key = 'comment'
        and l.source_key = p_source::text and l.points > 0) then v_reason := 'COMMENT_PAID'; end if;
    v_user := p_actor; v_key := 'comment-reply:' || p_source::text; v_target := 'comment:' || v_parent::text; v_cap := 10; v_kind := 'comment';
  elsif p_action = 'friend_add' then
    select f.requester_id, f.addressee_id into v_user, v_other from public.social_friendships f
      where f.id = p_source and f.status = 'accepted' and p_actor in (f.requester_id, f.addressee_id);
    if not found then v_reason := 'SOCIAL_EARN_NOT_FOUND'; end if;
    v_celebrity := public.social_earn_favorite(v_user); v_kind := case when v_celebrity is null then null else 'social_friend'::public.community_stamp_kind end;
    v_key := 'friend:' || least(v_user, v_other)::text || ':' || greatest(v_user, v_other)::text; v_cap := 5;
  elsif p_action = 'chat' then
    select m.conversation_id into v_conversation from public.social_dm_messages m
      join public.social_dm_conversations c on c.id = m.conversation_id
      where m.id = p_source and m.sender_id = p_actor and m.hidden_at is null and c.status = 'accepted';
    if not found then v_reason := 'SOCIAL_EARN_NOT_FOUND'; end if;
    v_celebrity := public.social_earn_favorite(p_actor); v_kind := case when v_celebrity is null then null else 'social_chat'::public.community_stamp_kind end;
    v_user := p_actor; v_key := 'chat:' || v_conversation::text || ':' || today::text; v_cap := 20;
  else
    raise exception 'UNKNOWN_ACTION' using errcode = 'P0001';
  end if;
  if v_reason is null and not public.dukjil_b3_payable(v_user) then v_reason := 'ACCOUNT_INACTIVE'; end if;
  if v_reason is not null then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', false, 'reason', v_reason, 'replayed', false);
  end if;

  perform public.group_wallet_lock(v_user);
  select * into prior from public.dukjil_action_log l where l.app_user_id = v_user and l.action_key = p_action and l.source_key = v_key;
  if found then
    return jsonb_build_object('points', prior.points, 'stampId', prior.stamp_id, 'capped', prior.capped, 'reason', prior.reason, 'replayed', true);
  end if;
  pol := public.dukjil_active_policy(v_now);
  if pol.version is null then v_reason := 'POLICY_INACTIVE';
  elsif p_action = 'friend_add' and exists(select 1 from public.dukjil_action_log l where l.action_key = 'friend_add' and l.source_key = v_key) then
    v_reason := 'PAIR_PAID';
  elsif v_target is not null and exists(select 1 from public.dukjil_action_log l
      where l.app_user_id = v_user and l.action_key = p_action and l.target_key = v_target) then
    v_reason := 'DUKJIL_REPEAT_TARGET';
  elsif v_kind is not null and not (
      exists(select 1 from public.celebrities c where c.id = v_celebrity and c.status = 'published' and c.archived_at is null)
      and exists(select 1 from public.fan_passports fp where fp.app_user_id = v_user and fp.celebrity_id = v_celebrity)) then
    v_reason := 'PASSPORT_REQUIRED';
  end if;
  if v_reason is not null then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', false, 'reason', v_reason, 'replayed', false);
  end if;
  if (select count(*) from public.dukjil_action_log l
      where l.app_user_id = v_user and l.action_key = p_action and l.kst_date = today and l.points > 0) >= v_cap then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', true, 'reason', 'POINT_CAP', 'replayed', false);
  end if;

  day_start := today::timestamp at time zone 'Asia/Seoul';
  if v_kind is not null and not exists(select 1 from public.community_stamps s
      where s.app_user_id = v_user and s.celebrity_id = v_celebrity and s.kind = v_kind
        and s.issued_at >= day_start and s.issued_at < day_start + interval '1 day') then
    -- The point is paid even when the stamp cannot be issued now (no embedded wallet yet).
    begin
      stamp := public.dukjil_issue_stamp(v_user, v_celebrity, v_kind, 'social:' || v_key, pol.version);
    exception when raise_exception or invalid_parameter_value then stamp := null;
    end;
  end if;
  entry := public.group_wallet_post(v_user, 'fan_point', 1::bigint, 'dukjil_action', log_id);
  insert into public.dukjil_action_log(id, app_user_id, celebrity_id, action_key, source_key, request_key, points,
      stamp_id, ledger_id, capped, reason, policy_version, kst_date, target_key)
    values (log_id, v_user, v_celebrity, p_action, v_key, log_id, 1, stamp, entry, false, null, pol.version, today, v_target);
  return jsonb_build_object('points', 1, 'stampId', stamp, 'capped', false, 'reason', null, 'replayed', false);
end $$;

do $$ begin
  perform public.b3_owner_execute('public.passport_place_stamp(uuid,uuid,uuid,public.community_stamp_kind)', array[
    'public.community_stamp_counts_for_tier(public.community_stamp_kind,text)']);
  perform public.b3_owner_execute('public.record_social_earn(uuid,text,uuid)', array['public.social_earn_favorite(uuid)']);
  perform public.b3_owner_access('public.social_earn_favorite(uuid)', array[
    'fan_profile_public_fields:select', 'celebrities:select', 'fan_passports:select']);
end $$;

notify pgrst, 'reload schema';
commit;

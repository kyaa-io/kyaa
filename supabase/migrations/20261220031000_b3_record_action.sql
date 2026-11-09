-- B3 §4: record_dukjil_action learns today's cheer, the Instagram repost and the tier bonus, and takes one clock reading per call.
--
-- Order inside the function after this patch (plan 4th ed.):
--   P3  account check before the wallet lock, for cheer, insta_repost and tier_bonus only: an account that is not active or has an
--       unrevoked moderation restriction (dukjil_b3_payable) gets {points 0, reason ACCOUNT_INACTIVE} with no lock, log, ledger or
--       stamp. Other actions keep failing in the lock with 42501 as before.
--   The answer gains "at" and "logId" for the three B3 actions only: the deployed web parses the other actions' answer strictly.
--   lock, then P1 one clock reading v_now := dukjil_now(): the KST date, the cap windows, the log's created_at and the answer's "at"
--       all come from it (a replay answers the original row's created_at).
--   P0  the policy is read at v_now (dukjil_active_policy(v_now)). A tier bonus is paid with the policy version and points fixed on its
--       grant (fan_tier_bonus_grants), whatever policy is active by then. POLICY_INACTIVE / UNKNOWN_ACTION stay where they were (after
--       the replay lookup) for every action except cheer, which needs the rule to build its key.
--   P2  cheer with sourceMode user_day: source 'cheer:<KST date>' and a request key derived from user and date, set here whatever the
--       caller sent, so a second cheer the same day (even for a new favorite) replays the first.
--   P4  favoriteOnly: the creator must be the member's favorite (DUKJIL_FAVORITE_REQUIRED).
--   P5  tier_bonus pays the points of its pending grant (source 'tier-bonus:<grant id>'), else DUKJIL_PARAMS_INVALID.
--   P6  capCountsApprovals: the day and month caps count every log row of the action (0P rows included), so the 21st approval of a
--       month is 0P even when some earlier approvals were 0P. monthCap adds a per-month cap (reason MONTH_CAP).
--   P7  with capCountsApprovals a capped approval is not an error: it writes one log row (points 0, the share stamp when its slot is
--       free) and answers normally.
-- dukjil_now() is volatile (clock_timestamp()); tests swap it inside a rolled-back transaction. Production behaviour is unchanged.
-- passport_stamp_action prefers the action with a mission-book slot (insta_repost and share both issue 'share' stamps).
-- Also inserts policy v2 as a draft (v1's rules with cheer 3P, insta_repost and tier_bonus). Nothing is activated here.
--
-- Rollback: supabase/rollback/20261220031000_b3_record_action.sql (reverts the pairs, md5 checked; deletes the v2 draft if still draft).
begin;
set local lock_timeout = '5s';

create function public.dukjil_now() returns timestamptz language sql volatile set search_path = '' as $$
  select pg_catalog.clock_timestamp()
$$;

-- The one account check of the three B3 payouts: active and no unrevoked moderation restriction.
create function public.dukjil_b3_payable(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users u where u.id = p_user and u.status = 'active')
     and not exists (select 1 from public.app_user_moderation_restrictions r where r.app_user_id = p_user and r.revoked_at is null)
$$;
revoke all on function public.dukjil_now(), public.dukjil_b3_payable(uuid) from public, anon, authenticated, service_role;

insert into public.b3_function_patch_bases (fn, base_md5) values
  ('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', '809df1c25a8edfc755acd3fccde4c030');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
-- declarations
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 1,
$o$declare
  today date := public.dukjil_kst_date();
$o$,
$p$declare
  v_now timestamptz; v_grant_id uuid; v_grant_status text; v_grant_points integer; v_grant_celebrity uuid; v_grant_policy integer; /* b3-decl */
  today date := public.dukjil_kst_date();
$p$),
-- P3 before the lock, P1 + P0 + P2 after it
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 2,
$o$  perform public.group_wallet_lock(p_user);
  select * into prior from public.dukjil_action_log
$o$,
$p$  /* b3-P3 */ if p_action_key in ('cheer', 'insta_repost', 'tier_bonus') and not public.dukjil_b3_payable(p_user) then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', false, 'reason', 'ACCOUNT_INACTIVE', 'replayed', false, 'at', public.dukjil_now());
  end if;
  perform public.group_wallet_lock(p_user);
  /* b3-P1 */ v_now := public.dukjil_now(); today := public.dukjil_kst_date(v_now);
  /* b3-P0 */ pol := public.dukjil_active_policy(v_now);
  rule := pol.rules -> 'actions' -> p_action_key;
  if p_action_key = 'tier_bonus' and p_source_key ~ '^tier-bonus:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select g.id, g.status, g.points, g.celebrity_id, g.policy_version
      into v_grant_id, v_grant_status, v_grant_points, v_grant_celebrity, v_grant_policy
      from public.fan_tier_bonus_grants g where g.id = pg_catalog.substr(p_source_key, 12)::uuid and g.app_user_id = p_user;
    if v_grant_id is not null then
      select * into pol from public.dukjil_policy_versions where version = v_grant_policy;
      rule := pol.rules -> 'actions' -> 'tier_bonus';
    end if;
  end if;
  if p_action_key = 'cheer' then
    if pol.version is null then raise exception 'POLICY_INACTIVE' using errcode = 'P0001'; end if;
    if rule is null then raise exception 'UNKNOWN_ACTION' using errcode = 'P0001'; end if;
    /* b3-P2 */ if rule ->> 'sourceMode' = 'user_day' then
      p_source_key := 'cheer:' || today::text;
      p_request_key := pg_catalog.md5('cheer:' || p_user::text || ':' || today::text)::uuid;
    end if;
  end if;
  select * into prior from public.dukjil_action_log
$p$),
-- replay answers the original time
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 3,
$o$      'reason', prior.reason, 'replayed', true);
$o$,
$p$      'reason', prior.reason, 'replayed', true) || case when p_action_key in ('cheer', 'insta_repost', 'tier_bonus') /* b3-at */
      then jsonb_build_object('at', prior.created_at, 'logId', prior.id) else '{}'::jsonb end;
$p$),
-- P0: the policy and rule are read above; the two refusals stay here
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 4,
$o$  pol := public.dukjil_active_policy();
$o$,
$p$  /* b3-P0 policy read after the lock */
$p$),
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 5,
$o$  rule := pol.rules -> 'actions' -> p_action_key;
  if rule is null then raise exception 'UNKNOWN_ACTION' using errcode = 'P0001'; end if;
$o$,
$p$  if rule is null then raise exception 'UNKNOWN_ACTION' using errcode = 'P0001'; end if;
  /* b3-P4 */ if coalesce((rule ->> 'favoriteOnly')::boolean, false) and not exists (select 1 from public.fan_profile_public_fields f
      where f.app_user_id = p_user and f.favorite_celebrity_id = p_celebrity) then
    raise exception 'DUKJIL_FAVORITE_REQUIRED' using errcode = 'P0001'; end if;
$p$),
-- P5
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 6,
$o$  if (rule -> 'pointsMin') is not null then
$o$,
$p$  /* b3-P5 */ if p_action_key = 'tier_bonus' then
    if v_grant_id is null or v_grant_status <> 'pending' or v_grant_celebrity is distinct from p_celebrity then
      raise exception 'DUKJIL_PARAMS_INVALID' using errcode = 'P0001'; end if;
    v_points := v_grant_points;
  elsif (rule -> 'pointsMin') is not null then
$p$),
-- P6 day cap counts approvals
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 7,
$o$      where app_user_id = p_user and action_key = p_action_key and points > 0
        and ((cap_per = 'user_day' and kst_date = today)
$o$,
$p$      where app_user_id = p_user and action_key = p_action_key
        and (points > 0 or coalesce((rule ->> 'capCountsApprovals')::boolean, false)) /* b3-P6 */
        and ((cap_per = 'user_day' and kst_date = today)
$p$),
-- P6 month cap
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 8,
$o$    if used >= cap_max then v_points := 0; point_capped := true; reason := 'POINT_CAP'; end if;
  end if;
$o$,
$p$    if used >= cap_max then v_points := 0; point_capped := true; reason := 'POINT_CAP'; end if;
  end if; /* b3-P6 month */
  if v_points > 0 and (rule -> 'monthCap') is not null then
    select count(*) into used from public.dukjil_action_log
      where app_user_id = p_user and action_key = p_action_key and kst_date >= month_start
        and (points > 0 or coalesce((rule ->> 'capCountsApprovals')::boolean, false));
    if used >= (rule ->> 'monthCap')::integer then v_points := 0; point_capped := true; reason := 'MONTH_CAP'; end if;
  end if;
$p$),
-- P7
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 9,
$o$  if v_points = 0 and (point_capped or stamp_capped) and (srule is null or stamp_capped) then
$o$,
$p$  if v_points = 0 and (point_capped or stamp_capped) and (srule is null or stamp_capped)
     and not coalesce((rule ->> 'capCountsApprovals')::boolean, false) /* b3-P7 */ then
$p$),
-- P1 log time and answer time
('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 10,
$o$      stamp_id, ledger_id, capped, reason, policy_version, kst_date, body_hash, target_key)
    values (log_id, p_user, p_celebrity, p_action_key, p_source_key, p_request_key, v_points, stamp, entry,
      point_capped or stamp_capped, reason, pol.version, today, v_body, v_target);
  return jsonb_build_object('points', v_points, 'stampId', stamp, 'capped', point_capped or stamp_capped,
    'reason', reason, 'replayed', false);
$o$,
$p$      stamp_id, ledger_id, capped, reason, policy_version, kst_date, body_hash, target_key, created_at /* b3-P1 */)
    values (log_id, p_user, p_celebrity, p_action_key, p_source_key, p_request_key, v_points, stamp, entry,
      point_capped or stamp_capped, reason, pol.version, today, v_body, v_target, v_now);
  return jsonb_build_object('points', v_points, 'stampId', stamp, 'capped', point_capped or stamp_capped,
    'reason', reason, 'replayed', false) || case when p_action_key in ('cheer', 'insta_repost', 'tier_bonus') /* b3-at */
      then jsonb_build_object('at', v_now, 'logId', log_id) else '{}'::jsonb end;
$p$);

do $$ begin perform public.b3_patch_function('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', false); end $$;

-- passport_stamp_action maps a stamp kind to the first action (by key) whose rule issues it. v2's insta_repost issues 'share' stamps
-- too and sorts before 'share', which would move every share stamp off mission slot 5. An action that has a mission-book slot wins.
insert into public.b3_function_patch_bases (fn, base_md5) values ('public.passport_stamp_action(public.community_stamp_kind)', '413e2309ae01b42a41589dc9cece94bb');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.passport_stamp_action(public.community_stamp_kind)', 1,
$o$where a.value #>> '{stamp,kind}' = p_kind::text order by a.key limit 1;$o$,
$p$where a.value #>> '{stamp,kind}' = p_kind::text
   order by exists(select 1 from jsonb_array_elements(pol.mission_book -> 'pages') pg, jsonb_array_elements(pg -> 'slots') s
                   where s ->> 'action' = a.key) desc, a.key /* b3-slot-action */ limit 1;$p$);
do $$ begin perform public.b3_patch_function('public.passport_stamp_action(public.community_stamp_kind)', false); end $$;

-- Policy v2 draft: v1's rules (as stored) with cheer 3P, the Instagram repost and the tier bonus (plan §3).
insert into public.dukjil_policy_versions (version, status, rules, mission_book, note, created_by)
select 2, 'draft',
  jsonb_set(jsonb_set(jsonb_set(v1.rules,
    '{actions,cheer}', jsonb_build_object('points', 3, 'pointCap', jsonb_build_object('per', 'user_day', 'max', 1),
      'favoriteOnly', true, 'sourceMode', 'user_day', 'stamp', v1.rules #> '{actions,cheer,stamp}')),
    '{actions,insta_repost}', $j${"points": 30, "pointCap": {"per": "user_day", "max": 1}, "monthCap": 20, "capCountsApprovals": true,
      "platform": "instagram", "postKinds": ["feed", "reel", "story"], "clawbackDays": 7, "reviewHours": 48,
      "stamp": {"kind": "share", "keyMode": "day", "capPer": "creator_day", "capMax": 1}}$j$::jsonb),
    '{actions,tier_bonus}', $j${"pointsByTier": {"Silver": 30, "Gold": 100, "Platinum": 300, "Diamond": 500}}$j$::jsonb),
  v1.mission_book,
  'B3 (기획 확정 2026-11-09): 오늘 응원 3P(최애만, 하루 1회, 스탬프는 v1 규칙), 인스타 리포스트 30P(승인 기준 하루 1회·월 20회, 7일 회수), 등급 상승 보너스(실버 30·골드 100·플래티넘 300·다이아 500, 크리에이터·등급별 1회). 활성화는 사용자 승인 뒤 replace_dukjil_policy로.',
  'b3-migration'
from public.dukjil_policy_versions v1 where v1.version = 1;
do $$ begin
  if not exists (select 1 from public.dukjil_policy_versions where version = 2 and status = 'draft' and rules #> '{actions,insta_repost}' is not null) then
    raise exception 'B3 policy v2 draft was not written (is policy 1 missing?)';
  end if;
end $$;

-- Access of the functions this file adds or patches, for the role that owns each (B3 review F3).
do $$ begin
  perform public.b3_owner_execute('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', array['public.dukjil_now()', 'public.dukjil_b3_payable(uuid)']);
  perform public.b3_owner_access('public.dukjil_b3_payable(uuid)', array['app_users:select', 'app_user_moderation_restrictions:select']);
  perform public.b3_owner_access('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', array['fan_profile_public_fields:select', 'dukjil_policy_versions:select']);
end $$;

notify pgrst, 'reload schema';
commit;

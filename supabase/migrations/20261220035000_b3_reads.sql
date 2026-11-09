-- B3 §8–9: what the mission screen and the wallet history read about the three B3 payouts.
--
-- read_dukjil_today(user, creator) gains, only while the policy in effect has the action (so the deployed web, which parses this answer
-- strictly, sees no new key before v2 takes effect):
--   instaRepost: { status, rejectCode, payResult } of the member's latest repost submitted today (for the creator when given), and
--     approvalsToday / approvalsMonth (repost log rows, 0P approvals included, the numbers the caps use) and paidMonth (paid ones);
--   nextTierBonus: { tier, points, progress, target } for the creator: the first tier above the current one that has no grant and was
--     not reached before the bonus started, with Silver counted in filled slots (of 3) and Gold / Platinum / Diamond in hearts (1, 14,
--     28); null when there is none left (Diamond reached included), no passport, or the account is not payable.
-- Today's cheer row is done when actions.cheer.count >= 1 (a cheer log row), never from actions.cheer.stamped: the day's first Claim
-- stamps a cheer too, and the member must still be able to tap.
-- read_owned_group_wallet_history: a tier bonus row carries tier (only on those rows), a repost take-back says
-- correctionReason 'insta_repost_revoked'.
--
-- Rollback: supabase/rollback/20261220035000_b3_reads.sql
begin;
set local lock_timeout = '5s';

create function public.read_dukjil_b3_today(p_user uuid, p_celebrity uuid, p_policy public.dukjil_policy_versions) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := public.dukjil_kst_date(); month_start date := date_trunc('month', public.dukjil_kst_date()::timestamp)::date;
  out jsonb := '{}'::jsonb; latest public.fan_share_proofs%rowtype; pass uuid; v_tier text; bonus_start timestamptz; t text;
  next_tier text; filled integer; hearts integer;
begin
  if p_policy.rules #> '{actions,insta_repost}' is not null then
    select * into latest from public.fan_share_proofs s
     where s.app_user_id = p_user and s.kind = 'insta_repost' and (p_celebrity is null or s.celebrity_id = p_celebrity)
       and s.submitted_at >= (today::timestamp at time zone 'Asia/Seoul')
     order by s.submitted_at desc, s.id desc limit 1;
    out := out || jsonb_build_object('instaRepost', jsonb_build_object(
      'status', latest.status, 'rejectCode', latest.reject_code, 'payResult', latest.pay_result,
      'approvalsToday', (select count(*) from public.dukjil_action_log l where l.app_user_id = p_user and l.action_key = 'insta_repost' and l.kst_date = today),
      'approvalsMonth', (select count(*) from public.dukjil_action_log l where l.app_user_id = p_user and l.action_key = 'insta_repost' and l.kst_date >= month_start),
      'paidMonth', (select count(*) from public.dukjil_action_log l where l.app_user_id = p_user and l.action_key = 'insta_repost' and l.kst_date >= month_start and l.points > 0)));
  end if;
  if p_policy.rules #> '{actions,tier_bonus}' is not null then
    if p_celebrity is not null and public.dukjil_b3_payable(p_user) then
      select id into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
    end if;
    if pass is not null then
      v_tier := public.get_fan_effective_tier(p_user, p_celebrity);
      select min(v.effective_from) into bonus_start from public.dukjil_policy_versions v
       where v.status in ('active', 'retired') and v.rules #> '{actions,tier_bonus}' is not null;
      foreach t in array array['Silver', 'Gold', 'Platinum', 'Diamond'] loop
        continue when public.fan_tier_rank(t) <= coalesce(public.fan_tier_rank(v_tier), 1);
        continue when exists (select 1 from public.fan_tier_bonus_grants g where g.app_user_id = p_user and g.celebrity_id = p_celebrity and g.tier = t);
        continue when exists (select 1 from public.fan_tier_history h where h.passport_id = pass and h.occurred_at < bonus_start
          and public.fan_tier_rank(h.tier) >= public.fan_tier_rank(t));
        next_tier := t; exit;
      end loop;
    end if;
    if next_tier is null then
      out := out || jsonb_build_object('nextTierBonus', null);
    else
      select count(*) into filled from public.passport_page_slots s where s.passport_id = pass and s.stamp_id is not null;
      hearts := public.passport_hearts(p_user, p_celebrity);
      out := out || jsonb_build_object('nextTierBonus', jsonb_build_object('tier', next_tier,
        'points', coalesce(nullif(p_policy.rules #>> array['actions', 'tier_bonus', 'pointsByTier', next_tier], '')::integer, 0),
        'progress', case when next_tier = 'Silver' then least(filled, 3) else greatest(hearts, 0) end,
        'target', case next_tier when 'Silver' then 3 when 'Gold' then 1 when 'Platinum' then 14 else 28 end));
    end if;
  end if;
  return out;
end $$;
revoke all on function public.read_dukjil_b3_today(uuid, uuid, public.dukjil_policy_versions) from public, anon, authenticated, service_role;

insert into public.b3_function_patch_bases (fn, base_md5) values
  ('public.read_dukjil_today(uuid,uuid)', 'f6a384f2a33131ba080af2878272ec3a'),
  ('public.read_owned_group_wallet_history(uuid,integer)', '91a877abf4646f531125d481cc85b02d');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.read_dukjil_today(uuid,uuid)', 1,
$o$    'actions', actions, 'attendance', att, 'hasPassport', has_pass);
$o$,
$p$    'actions', actions, 'attendance', att, 'hasPassport', has_pass) || public.read_dukjil_b3_today(p_user, p_celebrity, pol) /* b3-today */;
$p$),
('public.read_owned_group_wallet_history(uuid,integer)', 1,
$o$      'actionKey', x.action_key, 'correctionReason', x.correction_reason, 'pageName', x.page_name) order by x.created_at desc, x.id), '[]')) into result$o$,
$p$      'actionKey', x.action_key, 'correctionReason', x.correction_reason, 'pageName', x.page_name)
      || case when x.bonus_tier is not null then jsonb_build_object('tier', x.bonus_tier) else '{}'::jsonb end /* b3-tier */
      order by x.created_at desc, x.id), '[]')) into result$p$),
('public.read_owned_group_wallet_history(uuid,integer)', 2,
$o$        then case when c.void_reason in ('content_deleted', 'content_hidden') then c.void_reason else 'other' end$o$,
$p$        then case when c.void_reason in ('content_deleted', 'content_hidden', 'insta_repost_revoked' /* b3-revoked */) then c.void_reason else 'other' end$p$),
('public.read_owned_group_wallet_history(uuid,integer)', 3,
$o$      page.name as page_name
$o$,
$p$      page.name as page_name,
      (select g.tier from public.fan_tier_bonus_grants g where l.action_key = 'tier_bonus' and g.action_log_id = l.id) as bonus_tier /* b3-tier */
$p$);
do $$ begin
  perform public.b3_patch_function('public.read_dukjil_today(uuid,uuid)', false);
  perform public.b3_patch_function('public.read_owned_group_wallet_history(uuid,integer)', false);
end $$;

do $$ declare pair record; caller_owner name; target_owner name; begin
  for pair in select * from (values
    ('public.read_dukjil_today(uuid,uuid)', 'public.read_dukjil_b3_today(uuid,uuid,public.dukjil_policy_versions)'),
    ('public.read_dukjil_b3_today(uuid,uuid,public.dukjil_policy_versions)', 'public.dukjil_b3_payable(uuid)'),
    ('public.read_dukjil_b3_today(uuid,uuid,public.dukjil_policy_versions)', 'public.get_fan_effective_tier(uuid,uuid)'),
    ('public.read_dukjil_b3_today(uuid,uuid,public.dukjil_policy_versions)', 'public.passport_hearts(uuid,uuid)')) v(caller, target) loop
    select pg_get_userbyid(proowner) into caller_owner from pg_proc where oid = pair.caller::regprocedure;
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = pair.target::regprocedure;
    if caller_owner in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner % for %', caller_owner, pair.caller; end if;
    if caller_owner <> target_owner then execute format('grant execute on function %s to %I', pair.target, caller_owner); end if;
  end loop;
end $$;

-- owner-policy-begin: the wallet history now reads fan_tier_bonus_grants (created by this task with its own owner policy), the today
-- read reads share proofs, slots and grants. Same remedy as 20261215070000.
do $$
declare me record; t record;
begin
  select oid, rolname, rolsuper, rolbypassrls into me from pg_roles where rolname = current_user;
  if me.rolsuper or me.rolbypassrls then return; end if;
  for t in select * from (values ('fan_share_proofs','select'),('fan_tier_bonus_grants','select'),('passport_page_slots','select'),('fan_tier_history','select')) v(tname, privs) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or not pg_has_role(me.oid, c.relowner, 'USAGE')))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and me.oid = any(pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
-- owner-policy-end

notify pgrst, 'reload schema';
commit;

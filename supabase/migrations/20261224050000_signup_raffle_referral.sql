-- KYAA raffle: a friend who signs up and enters through my invite link gives me +3 chances (user decision 2026-11-13).
-- The existing general-fan referral is the source of truth: community_stamp_invite_redemptions holds one inviter per friend
-- (invitee is unique, self and mutual invites are refused, an account that already passed the fan screening cannot register a code),
-- so a friend counts once and for one inviter only. This file adds no new referral table; it reads that relation.
-- A friend counts when ALL hold:
--   the friend registered my code inside the raffle window and the relation is not cancelled,
--   the friend's account was created inside the raffle window (a sign-up, not an old account),
--   the friend entered the raffle inside the window,
--   neither of us is an operator/test account (signup_raffle_referral_excluded).
-- The weight (+3) lives in the server policy (rafflePolicySchema.weights.referral); the row only records the fact.
-- Comment and attendance rows and their daily caps are unchanged.
-- Rollback: supabase/rollback/20261224050000_signup_raffle_referral.sql.
begin;
set local lock_timeout = '5s';

alter table public.signup_raffle_actions drop constraint signup_raffle_actions_kind_check;
alter table public.signup_raffle_actions add constraint signup_raffle_actions_kind_check
  check (kind in ('attendance','comment','referral-signup'));

-- Accounts that never earn or give the referral bonus: disabled or restricted members, operators on the admin allowlist,
-- store sandbox testers, and addresses on reserved test domains (.test/.example/.invalid/.localhost, example.com/org/net, Privy test logins).
create function public.signup_raffle_referral_excluded(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.app_users member
    where member.id = p_user_id and member.status = 'active'
      and member.verified_email !~ '(\.(test|example|invalid|localhost)|@example\.(com|org|net)|@privy\.io)$'
      and not exists (select 1 from public.admin_allowlist admin where admin.email = member.verified_email and admin.active)
      and not exists (select 1 from public.mobile_store_sandbox_testers tester where tester.app_user_id = member.id and tester.enabled)
      and not exists (select 1 from public.app_user_moderation_restrictions restriction
        where restriction.app_user_id = member.id and restriction.revoked_at is null)
  )
$$;
revoke all on function public.signup_raffle_referral_excluded(uuid) from public, anon, authenticated;
grant execute on function public.signup_raffle_referral_excluded(uuid) to service_role;

create or replace function public.refresh_signup_raffle_participant(
  p_user_id uuid, p_enter boolean, p_starts_at timestamptz, p_closes_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('signup-raffle:' || p_user_id::text, 0));
  if p_enter then
    if v_now < p_starts_at or v_now > p_closes_at then return false; end if;
    insert into public.signup_raffle_entries(app_user_id,entered_at)
      values(p_user_id,v_now) on conflict(app_user_id) do nothing;
  end if;
  if not exists(select 1 from public.signup_raffle_entries where app_user_id=p_user_id) then return false; end if;
  update public.signup_raffle_entries set
    passport_received=exists(select 1 from public.fan_passports where app_user_id=p_user_id and business_status='issued'),
    community_joined=exists(select 1 from public.group_memberships where app_user_id=p_user_id)
    where app_user_id=p_user_id;
  delete from public.signup_raffle_actions where app_user_id=p_user_id;
  insert into public.signup_raffle_actions(app_user_id,kind,source_id,occurred_at)
  select p_user_id, source.kind, source.source_id, source.occurred_at from (
    select 'attendance'::text kind,'attendance:group_creator_attendance:' || id::text source_id,created_at occurred_at
      from public.group_creator_attendance where app_user_id=p_user_id
    union all
    select 'comment','comment:fan_post_comments:' || id::text,created_at
      from public.fan_post_comments where app_user_id=p_user_id and deleted_at is null and hidden_at is null
    union all
    select 'comment','comment:group_comments:' || id::text,created_at
      from public.group_comments where author_id=p_user_id and removed_at is null
    union all
    -- One row per friend. It happens when the later of "registered my code" and "entered the raffle" happens.
    select 'referral-signup','referral:community_stamp_invite_redemptions:' || redemption.id::text,
        greatest(redemption.redeemed_at, friend_entry.entered_at)
      from public.community_stamp_invite_redemptions redemption
      join public.community_stamp_invitation_relations relation
        on relation.redemption_id=redemption.id and relation.status<>'cancelled'
      join public.app_users friend on friend.id=redemption.invitee_app_user_id
      join public.signup_raffle_entries friend_entry on friend_entry.app_user_id=redemption.invitee_app_user_id
      where redemption.inviter_app_user_id=p_user_id
        and redemption.invitee_app_user_id<>p_user_id
        and redemption.redeemed_at between p_starts_at and p_closes_at
        and friend.created_at between p_starts_at and p_closes_at
        and friend_entry.entered_at between p_starts_at and p_closes_at
        and not public.signup_raffle_referral_excluded(redemption.invitee_app_user_id)
        and not public.signup_raffle_referral_excluded(p_user_id)
  ) source where source.occurred_at between p_starts_at and p_closes_at;
  return true;
end;
$$;
revoke all on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) to service_role;
commit;
notify pgrst, 'reload schema';

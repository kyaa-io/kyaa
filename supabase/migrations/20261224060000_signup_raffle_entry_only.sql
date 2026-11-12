-- KYAA raffle: entering is the only requirement for the draw (user decision 2026-11-13: "여러개하면 래플권 여러개 주면 되는거 아니야?").
-- Before this file the server draw roster only took members who had BOTH a Fan Passport and a community membership.
-- Now every entrant is on the roster with 1 chance, and the optional steps add chances instead of gating:
--   Fan Passport received  +1 (once)        -> one 'passport' row
--   community joined       +1 (once)        -> one 'community' row
--   comment / attendance   +1 each, up to 3 a day per kind (unchanged; the cap lives in the server policy)
--   friend referral        +3 per friend, no cap, a friend who entered before me still counts (unchanged rows from 20261224050000)
-- The weights live in the server policy (rafflePolicySchema.weights); rows only record facts. The roster filter on
-- passport_received/community_joined is removed in the same release (server/signup-event/local.ts candidates()).
-- passport_received/community_joined stay: the page still shows 완료 from them.
-- Rollback: supabase/rollback/20261224060000_signup_raffle_entry_only.sql.
begin;
set local lock_timeout = '5s';

alter table public.signup_raffle_actions drop constraint signup_raffle_actions_kind_check;
alter table public.signup_raffle_actions add constraint signup_raffle_actions_kind_check
  check (kind in ('attendance','comment','referral-signup','passport','community'));

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
    -- Fan Passport and community each add one chance, once per member (user decision 2026-11-13).
    -- The row happens when the first one was completed, or at the window start when it was done before the event;
    -- one completed after the close never counts.
    select 'passport','passport:fan_passports',greatest(min(issued_at),p_starts_at)
      from public.fan_passports where app_user_id=p_user_id and business_status='issued' having count(*)>0
    union all
    select 'community','community:group_memberships',greatest(min(joined_at),p_starts_at)
      from public.group_memberships where app_user_id=p_user_id having count(*)>0
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

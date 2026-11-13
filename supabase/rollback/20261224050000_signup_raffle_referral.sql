-- ORDER: roll the web back first (the page must stop promising +3), then THIS file.
-- Rollback of 20261224050000_signup_raffle_referral.sql: back to the state 20261224040000_signup_raffle.sql left.
-- Referral rows are derived on every refresh from the invite relation and the entries, so deleting them loses nothing:
-- applying the migration again rebuilds them. Entries, comment and attendance rows are untouched.
begin;
set local lock_timeout = '5s';

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
  ) source where source.occurred_at between p_starts_at and p_closes_at;
  return true;
end;
$$;
revoke all on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) to service_role;

delete from public.signup_raffle_actions where kind='referral-signup';
alter table public.signup_raffle_actions drop constraint signup_raffle_actions_kind_check;
alter table public.signup_raffle_actions add constraint signup_raffle_actions_kind_check
  check (kind in ('attendance','comment'));
drop function public.signup_raffle_referral_excluded(uuid);
commit;
notify pgrst, 'reload schema';

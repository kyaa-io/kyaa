-- KYAA raffle: a friend who opens /s/raffle?invite=<code> sees "<nickname> invited you" (RAFFLE-INVITE-TOSS-1125).
-- The code is the inviter's existing community invite code (24 hex letters, shared by the inviter on purpose).
-- Only the nickname comes back, and only when the inviter could earn the referral bonus
-- (active, not an operator/test/restricted account: signup_raffle_referral_excluded). Otherwise null, and the page
-- shows the general "a friend invited you" line. Nothing is written.
-- Rollback: supabase/rollback/20270116040000_signup_raffle_inviter_nickname.sql.
begin;
set local lock_timeout = '5s';

create function public.signup_raffle_inviter_nickname(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select profile.nickname
    from public.community_stamp_invite_codes invite
    join public.user_profiles profile on profile.app_user_id = invite.app_user_id
    where p_code ~ '^[A-F0-9]{24}$' and invite.code = p_code
      and not public.signup_raffle_referral_excluded(invite.app_user_id)
$$;
revoke all on function public.signup_raffle_inviter_nickname(text) from public, anon, authenticated;
grant execute on function public.signup_raffle_inviter_nickname(text) to service_role;
commit;
notify pgrst, 'reload schema';

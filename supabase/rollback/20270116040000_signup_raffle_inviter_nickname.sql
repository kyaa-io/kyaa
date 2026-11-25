-- ORDER: roll the web back first (the page stops asking for the inviter's nickname and shows the general line), then THIS file.
-- Rollback of 20270116040000_signup_raffle_inviter_nickname.sql. The function writes nothing, so nothing is lost.
begin;
set local lock_timeout = '5s';
drop function if exists public.signup_raffle_inviter_nickname(text);
commit;
notify pgrst, 'reload schema';

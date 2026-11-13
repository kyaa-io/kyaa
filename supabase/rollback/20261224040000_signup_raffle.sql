-- Destructive: export entries/actions and restore point before use; run after the other three rollbacks.
begin;
set local lock_timeout = '5s';
drop function public.read_signup_raffle_snapshot(uuid,timestamptz,timestamptz);
drop function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz);
drop table public.signup_raffle_actions;
drop table public.signup_raffle_entries;
commit;
notify pgrst, 'reload schema';

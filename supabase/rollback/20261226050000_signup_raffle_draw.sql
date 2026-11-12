-- Removes the stored signup raffle draw (F-03). A stored draw is the only record of the winners: export it before running this.
begin;
drop function if exists public.read_signup_raffle_draw(text);
drop function if exists public.record_signup_raffle_draw(text,timestamptz,text,uuid,uuid,jsonb,jsonb);
drop table if exists public.signup_raffle_draws;
commit;
notify pgrst, 'reload schema';

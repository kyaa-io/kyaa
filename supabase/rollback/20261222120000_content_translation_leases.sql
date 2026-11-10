-- Rollback of 20261222120000_content_translation_leases.sql: drops the four lease functions and the lease table. Cached translations are untouched.
-- Run only after the previous app version serves all traffic; an app that still calls the lease functions would answer 5xx until then.
begin;
set local lock_timeout = '5s';
drop function public.save_content_translation_slots_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text);
drop function public.save_content_translation_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,text,text);
drop function public.release_content_translation_lease(uuid);
drop function public.claim_content_translation_lease(uuid,text,uuid,text,public.content_locale,text,integer,text,integer);
drop table public.content_translation_leases;
notify pgrst, 'reload schema';
commit;

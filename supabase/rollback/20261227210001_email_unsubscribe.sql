-- Rollback for 20261227210001_email_unsubscribe.sql. Roll the web back first: the unsubscribe page and endpoint call this function.
-- Mail already sent keeps its links; they answer with the unavailable page after the function is gone. Nothing else is touched.
begin;
set local lock_timeout='5s';
drop function if exists public.apply_email_unsubscribe(uuid,text,text,text,boolean,timestamptz);
notify pgrst, 'reload schema';
commit;

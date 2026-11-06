-- Rollback for 20261212013000_celebrity_name_directory.sql. Roll the web back first: new web reads this function.
-- Removes the loaded dictionary. It can be loaded again from the file listed in the release ledger.
begin;
set local lock_timeout='5s';
drop function public.celebrity_name_suggest(text,integer,text);
drop table public.celebrity_name_terms;
drop table public.celebrity_name_entries;
drop function public.celebrity_name_key(text);
commit;

-- Rollback for 20261218030000_list_facts_review_fixes.sql.
-- Only the access step goes. The readers keep their stricter bodies: they answer only fields= requests, and rolling back
-- 20261218020000 and 20261218010000 removes them. Grants the access step gave stay, as with the owner-check grants.
begin;
set local lock_timeout = '5s';
drop function public.list_facts_wrapper_access();
commit;

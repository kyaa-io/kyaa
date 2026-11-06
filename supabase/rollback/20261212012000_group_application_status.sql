-- Rollback for 20261212012000_group_application_status.sql. Roll the web back first: new web reads this function.
begin;
set local lock_timeout='5s';
drop function public.group_application_status(uuid,uuid,integer);
commit;

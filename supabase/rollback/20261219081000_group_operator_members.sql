-- Rollback of 20261219081000_group_operator_members.sql: operator-members and its export answer 503 again (the 20261219080000 wrapper
-- still routes them here). group_member_exports is kept as the record of past exports. Policies b8_owner_<role> stay (select/insert only).
begin;
set local lock_timeout = '5s';
drop function public.group_operator_members_dispatch(text,uuid,uuid,jsonb);
drop function public.group_operator_member_rows(uuid,uuid,text,text);
drop function public.group_operator_member_item(uuid,uuid,text,timestamptz,text,integer);
notify pgrst, 'reload schema';
commit;

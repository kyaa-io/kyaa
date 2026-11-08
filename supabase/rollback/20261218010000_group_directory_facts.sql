-- Rollback for 20261218010000_group_directory_facts.sql.
-- Roll the web back first: the new web sends fields=facts on /api/groups and fields=replies on group comments.
-- The owner-check lists keep the added names and tables; a name with no function matches nothing, and a listed table only keeps its read grant.
begin;
set local lock_timeout = '5s';
drop function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_reply_count(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
drop function public.group_directory_facts(jsonb);
drop function public.group_comment_reply_counts(uuid,jsonb);
drop index if exists public.group_memberships_page_joined_idx;
-- 20261218020000 lists the two helpers among the owner functions; take them out so the owner check does not look for them.
do $patch$
declare def text;
begin
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 execute replace(def,$a$'public.group_directory_facts(jsonb)','public.group_comment_reply_counts(uuid,jsonb)',$a$,'');
end $patch$;
drop index if exists public.group_comments_parent_idx;
commit;

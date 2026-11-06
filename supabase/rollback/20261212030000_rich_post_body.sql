-- Rollback for 20261212030000_rich_post_body.sql.
-- Roll the web back first: the current web calls save_fan_post_rich and read_fan_post_body_doc.
-- Formatting of posts written with the rich editor is lost; `body` keeps their text, and attachments stay attached.
begin;
set local lock_timeout = '5s';
drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_rich_body(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
drop function public.read_fan_post_body_doc(uuid,uuid);
drop function public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb);
drop trigger clear_stale_body_doc on public.fan_posts;
drop trigger clear_stale_body_doc on public.group_posts;
drop function public.clear_stale_post_body_doc();
alter table public.fan_posts drop column body_doc;
alter table public.group_posts drop column body_doc;
commit;

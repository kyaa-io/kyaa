-- Rollback for 20261218020000_social_notification_facts.sql.
-- Roll the web back first: the new web calls these readers for fields=facts, fields=actor and fields=replies.
-- The owner-check lists keep the added names, tables and functions; a name with no function matches nothing.
begin;
set local lock_timeout = '5s';
drop function public.read_celebrity_notice_comments_replies(text,text,uuid,timestamptz,uuid,integer,public.content_locale);
drop function public.read_fan_post_comments_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale);
drop function public.read_owned_social_friends_facts(uuid,public.content_locale);
drop function public.get_owned_web_notifications_facts(uuid,public.content_locale);
drop function public.web_notification_facts(uuid,jsonb,public.content_locale);
drop function public.fan_post_thumbnail_url(uuid);
drop function public.web_notification_actor(uuid,uuid,text,public.content_locale);
drop index if exists public.fan_post_comments_parent_idx;
-- The owner-function list names the dropped helpers; take them out so the owner check does not look for them.
do $patch$
declare def text;
begin
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 def:=replace(def,$a$'public.web_notification_actor(uuid,uuid,text,public.content_locale)','public.fan_post_thumbnail_url(uuid)','public.web_notification_facts(uuid,jsonb,public.content_locale)',$a$,'');
 execute def;
end $patch$;
commit;

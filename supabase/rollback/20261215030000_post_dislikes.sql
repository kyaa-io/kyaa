-- Rollback for 20261215030000_post_dislikes.sql.
-- Roll the web back first: the current web calls set_fan_post_reaction, read_fan_post_reaction and the group 'dislike' operation.
-- Every dislike is lost. Likes are untouched. The p3_fn_owner_<role> grants and policies stay, as with 20261210240000.
begin;
set local lock_timeout = '5s';
drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_post_dislike(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
drop function public.group_post_reaction_json(uuid,uuid,uuid);
drop function public.group_post_dislike_count_visible(uuid,uuid,uuid);
drop function public.set_fan_post_reaction(uuid,uuid,text);
drop function public.read_fan_post_reaction(uuid,uuid);
drop function public.fan_post_dislike_count_visible(uuid,uuid);
drop trigger app_users_scrub_post_dislikes on public.app_users;
drop function public.scrub_post_dislikes_on_deletion();
drop trigger clear_post_dislike on public.fan_post_likes;
drop trigger clear_post_dislike on public.group_post_reactions;
drop table public.fan_post_dislikes;
drop table public.group_post_dislikes;
drop function public.clear_opposite_post_reaction();
commit;

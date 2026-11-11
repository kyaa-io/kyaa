-- Roll back the web first. Existing notice likes are preserved.
begin;
drop trigger app_users_scrub_notice_dislikes on public.app_users;
drop function public.scrub_notice_dislikes_on_deletion();
drop function public.set_celebrity_notice_reaction(uuid,text,text,public.content_locale,text);
drop function public.read_celebrity_notice_reaction(uuid,text,text,public.content_locale);
drop trigger clear_notice_dislike on public.celebrity_notice_likes;
drop trigger clear_notice_like on public.celebrity_notice_dislikes;
drop function public.clear_opposite_notice_reaction();
drop table public.celebrity_notice_dislikes;
commit;
notify pgrst,'reload schema';

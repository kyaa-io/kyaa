-- Evaluate eligibility as the checked-in author while retaining moderation and parent visibility.
begin;
create or replace function public.award_fan_program_comment_stamp() returns trigger language plpgsql security definer set search_path='' as $$
declare notice_id uuid; target_type text;
begin
 if tg_table_name='celebrity_notice_comments' then
  notice_id:=new.notice_id; target_type:='notice_comment';
  if new.parent_id is not null and not exists(select 1 from public.celebrity_notice_comments p where p.id=new.parent_id and p.notice_id=new.notice_id and p.removed_at is null
   and public.fan_web_content_visible(new.app_user_id,'notice_comment',p.id)) then return new; end if;
 else
  select p.program_notice_id into notice_id from public.fan_posts p where p.id=new.post_id and p.visibility='public';
  target_type:='fan_post_comment';
 end if;
 if not exists(select 1 from public.celebrity_notices n where n.id=notice_id and n.id=public.fan_program_notice('kyaa-wave-fanpage',n.slug)) then return new; end if;
 perform public.fan_web_lock_active_user(new.app_user_id);
 if not public.fan_web_content_visible(new.app_user_id,target_type,new.id) then return new; end if;
 insert into public.fan_program_stamps(app_user_id,program_notice_id) values(new.app_user_id,notice_id) on conflict do nothing;
 return new;
end $$;
commit;

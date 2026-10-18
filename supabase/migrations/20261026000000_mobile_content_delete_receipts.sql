-- A client may retry a delete after losing the response. Keep an owned,
-- already-deleted clip or comment as the same successful outcome.

create or replace function public.remove_mobile_content_fan_clip(
  p_app_user_id uuid,
  p_clip_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare clip public.fan_clips%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into clip from public.fan_clips
    where id=p_clip_id and app_user_id=p_app_user_id for update;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if clip.deleted_at is not null then return; end if;

  update public.fan_clips set body='',deleted_at=clock_timestamp(),
    revision=revision+1,updated_at=clock_timestamp() where id=p_clip_id;
  update public.fan_clip_comments set body='[deleted]',
    deleted_at=coalesce(deleted_at,clock_timestamp()),
    revision=revision+case when deleted_at is null then 1 else 0 end,
    updated_at=clock_timestamp()
    where clip_id=p_clip_id and deleted_at is null;
  delete from public.fan_clip_likes where clip_id=p_clip_id;
  delete from public.mobile_content_comment_reactions
    where target_type='fan_clip_comment' and target_id in(
      select id from public.fan_clip_comments where clip_id=p_clip_id
    );
  update public.mobile_media_assets set state='cancelled',
    asset_version=asset_version+1,
    cleanup_requested_at=coalesce(cleanup_requested_at,clock_timestamp()),
    cleanup_retry_at=greatest(
      clock_timestamp(),
      coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'
    ),updated_at=clock_timestamp()
    where attached_type='fan_clip' and attached_id=p_clip_id
      and storage_deleted_at is null;
end $$;

create or replace function public.remove_mobile_content_clip_comment(
  p_app_user_id uuid,
  p_comment_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare comment public.fan_clip_comments%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into comment from public.fan_clip_comments
    where id=p_comment_id and app_user_id=p_app_user_id for update;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if comment.deleted_at is not null then return; end if;
  update public.fan_clip_comments set body='[deleted]',
    deleted_at=clock_timestamp(),revision=revision+1,
    updated_at=clock_timestamp() where id=p_comment_id;
  delete from public.mobile_content_comment_reactions
    where target_type='fan_clip_comment' and target_id=p_comment_id;
end $$;

revoke all on function public.remove_mobile_content_fan_clip(uuid,uuid),
  public.remove_mobile_content_clip_comment(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.remove_mobile_content_fan_clip(uuid,uuid),
  public.remove_mobile_content_clip_comment(uuid,uuid)
  to service_role;

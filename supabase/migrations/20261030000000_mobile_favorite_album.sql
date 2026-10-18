begin;

create function public.read_owned_mobile_favorite_album(
  p_app_user_id uuid,
  p_passport_id uuid,
  p_locale public.content_locale default 'ko',
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_limit not between 1 and 50
    or (p_before is null) <> (p_before_id is null) then
    raise exception 'FAN_WEB_INVALID_INPUT';
  end if;

  with owned as materialized (
    select passport.celebrity_id,celebrity.slug,celebrity.image_url,
      coalesce(localization.name,celebrity.slug) name,
      celebrity.status='published' and celebrity.archived_at is null source_available
    from public.fan_passports passport
    join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
    join public.celebrities celebrity on celebrity.id=passport.celebrity_id
    left join lateral (
      select candidate.name
      from public.celebrity_localizations candidate
      where candidate.celebrity_id=celebrity.id
      order by case candidate.locale when p_locale then 0 when 'en' then 1 else 2 end,candidate.locale
      limit 1
    ) localization on true
    where passport.id=p_passport_id and passport.app_user_id=p_app_user_id
      and passport.business_status='issued'
  ), sources as materialized (
    select post.id source_id,'fan_post'::text source_type,post.body,post.created_at,
      (select count(*)::integer from public.fan_post_likes fan_like
        join public.app_users fan_like_user on fan_like_user.id=fan_like.app_user_id and fan_like_user.status='active'
        where fan_like.post_id=post.id and not public.fan_web_blocked(p_app_user_id,fan_like.app_user_id)) like_count
    from owned
    join public.fan_posts post on post.celebrity_id=owned.celebrity_id
    where owned.source_available and public.fan_web_content_visible(p_app_user_id,'fan_post',post.id)
    union all
    select clip.id,'fan_clip',clip.body,clip.created_at,
      (select count(*)::integer from public.fan_clip_likes clip_like
        join public.app_users clip_like_user on clip_like_user.id=clip_like.app_user_id and clip_like_user.status='active'
        where clip_like.clip_id=clip.id and not public.fan_web_blocked(p_app_user_id,clip_like.app_user_id))
    from owned
    join public.fan_clips clip on clip.celebrity_id=owned.celebrity_id
    where owned.source_available and public.fan_web_content_visible(p_app_user_id,'fan_clip',clip.id)
  ), candidates as materialized (
    select asset.id,source.source_type,source.source_id,source.body,source.created_at,
      asset.kind,asset.width,asset.height,asset.duration_seconds,source.like_count
    from sources source
    join public.mobile_media_assets asset on asset.attached_type=source.source_type
      and asset.attached_id=source.source_id and asset.state='ready' and asset.storage_deleted_at is null
      and asset.access_scope=source.source_type
    where p_before is null or (source.created_at,asset.id)<(p_before,p_before_id)
    order by source.created_at desc,asset.id desc
    limit p_limit+1
  ), page as (
    select * from candidates order by created_at desc,id desc limit p_limit
  )
  select case when exists(select 1 from owned) then jsonb_build_object(
    'favorite',(select jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url) from owned),
    'sourceAvailable',(select source_available from owned),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'sourceType',source_type,'sourceId',source_id,'kind',kind,'body',body,
      'createdAt',created_at,'width',width,'height',height,'durationSeconds',duration_seconds,
      'likeCount',like_count
    ) order by created_at desc,id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>p_limit from candidates)
  ) else null end into result;
  return result;
end $$;

revoke all on function public.read_owned_mobile_favorite_album(
  uuid,uuid,public.content_locale,timestamptz,uuid,integer
) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_favorite_album(
  uuid,uuid,public.content_locale,timestamptz,uuid,integer
) to service_role;

commit;

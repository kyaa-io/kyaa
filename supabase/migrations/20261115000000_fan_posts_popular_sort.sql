-- FEED-010 popular posts use viewer-visible engagement with a stable score/time/id cursor.
drop function public.read_fan_posts(uuid,text,timestamptz,uuid,integer,public.content_locale);

create function public.read_fan_posts(
  p_app_user_id uuid,
  p_slug text,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_before_score bigint default null,
  p_sort text default 'latest',
  p_limit integer default 20,
  p_locale public.content_locale default 'ko'
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_sort not in ('latest','popular')
    or (p_before is null) <> (p_before_id is null)
    or (p_sort='latest' and p_before_score is not null)
    or (p_sort='popular' and p_before is not null and p_before_score is null)
    or p_limit not between 1 and 50 then
    raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023';
  end if;

  return (
    with creator as (
      select id from public.celebrities
      where slug=p_slug and status='published' and archived_at is null
    ),
    visible as materialized (
      select p.id,p.created_at,
        ((select count(*) from public.fan_post_likes k
          join public.app_users u on u.id=k.app_user_id and u.status='active'
          where k.post_id=p.id and not public.fan_web_blocked(p_app_user_id,k.app_user_id))
        +(select count(*) from public.fan_post_comments x
          where x.post_id=p.id and public.fan_web_content_visible(p_app_user_id,'fan_post_comment',x.id)))::bigint engagement
      from public.fan_posts p join creator c on c.id=p.celebrity_id
      where public.fan_web_content_visible(p_app_user_id,'fan_post',p.id)
    ),
    candidates as materialized (
      select * from visible v
      where p_before is null
        or (p_sort='latest' and (v.created_at,v.id)<(p_before,p_before_id))
        or (p_sort='popular' and (v.engagement,v.created_at,v.id)<(p_before_score,p_before,p_before_id))
      order by case when p_sort='popular' then v.engagement end desc,v.created_at desc,v.id desc
      limit p_limit+1
    ),
    page as (
      select * from candidates v
      order by case when p_sort='popular' then v.engagement end desc,v.created_at desc,v.id desc
      limit p_limit
    )
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(public.fan_web_post_json(p_app_user_id,id,p_locale)
        order by case when p_sort='popular' then engagement end desc,created_at desc,id desc) from page),'[]'::jsonb),
      'hasMore',(select count(*)>p_limit from candidates)
    ) from creator
  );
end $$;

revoke all on function public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale) to service_role;

-- FEED-050 keeps the existing participation-post delete contract while making
-- the last concert-album post consequence an authoritative, atomic result.
create or replace function public.remove_owned_mobile_participation_post_v2(
  p_app_user_id uuid,
  p_post_id uuid,
  p_expected_revision integer,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  p public.mobile_participation_posts%rowtype;
  q public.mobile_participation_post_requests%rowtype;
  h text:=md5(jsonb_build_array('delete',p_post_id,p_expected_revision)::text);
  response jsonb;
  access_lost boolean:=false;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into q from public.mobile_participation_post_requests
  where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then
    if q.payload_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
    return q.result||jsonb_build_object('replayed',true);
  end if;
  select*into p from public.mobile_participation_posts
  where id=p_post_id and app_user_id=p_app_user_id and status='valid'for update;
  if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;
  if p.revision<>p_expected_revision then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;

  select
    c.context_type='album' and c.album_kind='concert'
    and exists(
      select 1 from public.mobile_participation_events e
      join public.mobile_participation_checkins x
        on x.event_id=e.id and x.app_user_id=p_app_user_id
        and x.status='valid' and x.policy_version=e.policy_version
      where e.id=c.source_event_id and e.state in('published','ended')
    )
    and 1=(
      select count(*) from public.mobile_participation_posts own_post
      where own_post.context_id=c.id and own_post.app_user_id=p_app_user_id
        and own_post.status='valid'
    )
  into access_lost
  from public.mobile_participation_contexts c where c.id=p.context_id;

  update public.mobile_participation_posts set
    status='deleted',revision=revision+1,updated_at=pg_catalog.clock_timestamp()
  where id=p.id returning*into p;
  update public.mobile_media_assets set
    state='cancelled',asset_version=asset_version+1,
    cleanup_requested_at=pg_catalog.clock_timestamp(),
    cleanup_retry_at=greatest(
      pg_catalog.clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'
    ),updated_at=pg_catalog.clock_timestamp()
  where attached_type='participation_post'and attached_id=p.id and storage_deleted_at is null;
  response:=jsonb_build_object(
    'id',p.id,'revision',p.revision,'removed',true,'replayed',false,
    'accessLost',access_lost
  );
  insert into public.mobile_participation_post_requests(
    app_user_id,request_key,operation,post_id,payload_hash,result
  )values(p_app_user_id,p_request_key,'delete',p.id,h,response);
  return response;
end
$$;

begin;

alter table public.mobile_media_assets drop constraint mobile_media_assets_purpose_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_purpose_check check(purpose in('fan_post','fan_clip','dm','certification','participation','support','official_post','wave_album','wave_post'));
alter table public.mobile_media_assets add constraint mobile_media_wave_post_video check(purpose<>'wave_post' or kind='video');

create function public.kyaa_wave_checked_in(p_app_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users u join public.kyaa_wave_participants p on p.app_user_id=u.id where u.id=p_app_user_id and u.status='active' and p.event_key='kyaa-wave-2026');
$$;
revoke all on function public.kyaa_wave_checked_in(uuid) from public,anon,authenticated,service_role;


create or replace function public.reserve_owned_mobile_media(
  p_app_user_id uuid,p_kind text,p_purpose text,p_content_type text,p_byte_size integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.mobile_media_assets%rowtype;v_id uuid:=extensions.gen_random_uuid();v_hash text;v_ext text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_id is null or p_kind not in('image','video')
    or p_purpose not in('fan_post','fan_clip','dm','certification','participation','support','official_post','wave_album','wave_post')
    or p_content_type not in('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')
    or p_byte_size not between 1 and 52428800
    or(p_kind='image'and(p_content_type not like'image/%'or p_byte_size>8388608))
    or(p_kind='video'and p_content_type not like'video/%')
    or(p_purpose in('fan_post','certification','support')and p_kind<>'image') then
    raise exception 'MEDIA_INVALID_INPUT'; end if;
  if p_purpose in('wave_album','wave_post') and (not public.kyaa_wave_checked_in(p_app_user_id) or (p_purpose='wave_post' and p_kind<>'video')) then raise exception 'MEDIA_INVALID_INPUT'; end if;
  v_hash:=md5(p_kind||':'||p_purpose||':'||p_content_type||':'||p_byte_size::text);
  select * into a from public.mobile_media_assets where app_user_id=p_app_user_id and request_id=p_request_id;
  if found then
    if a.request_hash<>v_hash or a.state<>'uploading'or a.upload_expires_at<=clock_timestamp()then raise exception'MEDIA_CONFLICT';end if;
    return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'expiresAt',a.upload_expires_at,'replayed',true);
  end if;
  if(select count(*)from public.mobile_media_assets where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=(case when p_purpose in('wave_album','wave_post') then 30 else 20 end) then raise exception'MEDIA_RATE_LIMITED';end if;
  v_ext:=case p_content_type when'image/jpeg'then'jpg'when'image/png'then'png'when'image/webp'then'webp'when'video/quicktime'then'mov'else'mp4'end;
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,storage_path,thumbnail_path,request_id,request_hash)
    values(v_id,p_app_user_id,p_kind,p_purpose,p_content_type,p_byte_size,p_app_user_id::text||'/'||v_id::text||'/original.'||v_ext,p_app_user_id::text||'/'||v_id::text||'/thumbnail.webp',p_request_id,v_hash)
    returning * into a;
  return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'expiresAt',a.upload_expires_at,'replayed',false);
end $$;

create or replace function public.is_kyaa_wave_resource(p_kind text,p_resource_id text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare creator_id uuid; resource_id uuid;
begin
 if p_kind='live_event' then
  select celebrity_id into creator_id from public.live_events where slug=p_resource_id;
 else
  begin resource_id:=p_resource_id::uuid; exception when invalid_text_representation then return false; end;
  case p_kind
   when 'fan_post' then select celebrity_id into creator_id from public.fan_posts where id=resource_id;
   when 'fan_post_comment' then select p.celebrity_id into creator_id from public.fan_post_comments x join public.fan_posts p on p.id=x.post_id where x.id=resource_id;
   when 'notice' then select celebrity_id into creator_id from public.celebrity_notices where id=resource_id;
   when 'notice_comment' then select n.celebrity_id into creator_id from public.celebrity_notice_comments x join public.celebrity_notices n on n.id=x.notice_id where x.id=resource_id;
   when 'content_asset' then select celebrity_id into creator_id from public.content_assets where id=resource_id;
   when 'cheer' then select celebrity_id into creator_id from public.fan_lounge_messages where id=resource_id;
   when 'fan_clip' then select celebrity_id into creator_id from public.fan_clips where id=resource_id;
   when 'fan_clip_comment' then select p.celebrity_id into creator_id from public.fan_clip_comments x join public.fan_clips p on p.id=x.clip_id where x.id=resource_id;
   when 'benefit' then select celebrity_id into creator_id from public.benefits where id=resource_id;
   when 'live_mission' then select e.celebrity_id into creator_id from public.live_surveys m join public.live_events e on e.id=m.live_event_id where m.id=resource_id;
   when 'quiz_attempt' then select celebrity_id into creator_id from public.quiz_attempts where id=resource_id;
   when 'live_submission' then select e.celebrity_id into creator_id from public.live_fan_submissions x join public.live_events e on e.id=x.live_event_id where x.id=resource_id;
   when 'media' then
    if exists(select 1 from public.mobile_media_assets where id=resource_id and purpose in('wave_album','wave_post')) then return true; end if;
    select coalesce(p.celebrity_id,n.celebrity_id,clip.celebrity_id) into creator_id from public.mobile_media_assets a
    left join public.fan_posts p on a.attached_type='fan_post' and p.id=a.attached_id
    left join public.celebrity_notices n on a.attached_type='notice' and n.id=a.attached_id
    left join public.fan_clips clip on a.attached_type='fan_clip' and clip.id=a.attached_id
    where a.id=resource_id;
   else return false;
  end case;
 end if;
 return exists(select 1 from public.celebrities where id=creator_id and slug='kyaa-wave-fanpage');
end;
$$;

alter function public.fan_web_content_target(uuid,text,uuid,public.content_locale) rename to fan_web_content_target_before_wave_media;
create function public.fan_web_content_target(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_locale public.content_locale default 'ko') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.is_kyaa_wave_resource(p_target_type,p_target_id::text) and not public.kyaa_wave_checked_in(p_app_user_id) then return null; end if;
 if p_target_type='fan_clip' and exists(select 1 from public.fan_clips c join public.celebrities creator on creator.id=c.celebrity_id where c.id=p_target_id and creator.slug='kyaa-wave-fanpage' and not public.kyaa_wave_checked_in(c.app_user_id)) then return null; end if;
 return public.fan_web_content_target_before_wave_media(p_app_user_id,p_target_type,p_target_id,p_locale);
end $$;
revoke all on function public.fan_web_content_target_before_wave_media(uuid,text,uuid,public.content_locale),public.fan_web_content_target(uuid,text,uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.fan_web_content_target(uuid,text,uuid,public.content_locale) to service_role;


alter function public.authorize_mobile_media_read(uuid,uuid,text) rename to authorize_mobile_media_read_before_wave_media;
create function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; a public.mobile_media_assets%rowtype;
begin
 if public.is_kyaa_wave_resource('media',p_asset_id::text) and not public.kyaa_wave_checked_in(p_app_user_id) then return null; end if;
 result:=public.authorize_mobile_media_read_before_wave_media(p_app_user_id,p_asset_id,p_variant);
 if result is null then return null; end if;
 select * into a from public.mobile_media_assets where id=p_asset_id;
 if a.purpose='wave_album' and a.kind='image' and p_variant='original' then
  return jsonb_build_object('storagePath',regexp_replace(a.storage_path,'[^/]+$','display.webp'),'contentType','image/webp');
 end if;
 return result;
end $$;
revoke all on function public.authorize_mobile_media_read_before_wave_media(uuid,uuid,text),public.authorize_mobile_media_read(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_mobile_media_read(uuid,uuid,text) to service_role;

create or replace function public.claim_mobile_media_cleanup(p_limit integer default 25)returns jsonb language plpgsql security definer set search_path=''as $$declare result jsonb;begin
 update public.mobile_media_assets a set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(a.storage_token_expires_at,a.upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()where a.storage_deleted_at is null and a.attached_id is null and((a.state='uploading'and a.upload_expires_at<=clock_timestamp())or exists(select 1 from public.app_users u where u.id=a.app_user_id and u.status<>'active'));
 with due as(select id from public.mobile_media_assets where storage_deleted_at is null and cleanup_requested_at is not null and(cleanup_retry_at is null or cleanup_retry_at<=clock_timestamp())order by cleanup_retry_at nulls first,created_at for update skip locked limit least(greatest(p_limit,1),50)),claimed as(update public.mobile_media_assets a set cleanup_generation=cleanup_generation+1,cleanup_retry_at=clock_timestamp()+interval'5 minutes'from due where a.id=due.id returning a.id,a.storage_path,a.thumbnail_path,a.purpose,a.kind,a.cleanup_generation)select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('assetId',id,'storagePath',storage_path,'thumbnailPath',thumbnail_path,'displayPath',case when purpose='wave_album' and kind='image' then regexp_replace(storage_path,'[^/]+$','display.webp') else null end,'generation',cleanup_generation)),'[]'::jsonb))into result from claimed;return result;end $$;

create or replace function public.save_fan_post(p_app_user_id uuid,p_slug text,p_post_id uuid,p_body text,p_visibility text,p_asset_ids uuid[],p_expected_revision integer,p_idempotency_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare v_creator uuid;v_post public.fan_posts%rowtype;v_id uuid;v_hash text;v_body text:=btrim(coalesce(p_body,''));v_assets uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]);v_valid integer;begin perform public.fan_web_lock_active_user(p_app_user_id);if p_visibility is null or p_visibility not in('public','members')or length(v_body)>5000 or cardinality(v_assets)>4 or cardinality(v_assets)<>(select count(distinct x)from unnest(v_assets)x)or(v_body=''and cardinality(v_assets)=0)then raise exception'FAN_WEB_INVALID_INPUT';end if;select id into v_creator from public.celebrities where slug=p_slug and status='published'and archived_at is null for share;if v_creator is null then raise exception'FAN_WEB_NOT_FOUND';end if;if p_visibility='members'and not public.fan_web_is_member(p_app_user_id,v_creator)then raise exception'FAN_WEB_FORBIDDEN';end if;if p_slug='kyaa-wave-fanpage' and (v_body='' or not public.kyaa_wave_checked_in(p_app_user_id)) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;v_hash:=encode(extensions.digest(jsonb_build_array(v_creator,v_body,p_visibility,v_assets)::text,'sha256'),'hex');if p_post_id is null then if p_idempotency_key is null then raise exception'FAN_WEB_INVALID_INPUT';end if;select*into v_post from public.fan_posts where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;if found then if v_post.create_request_hash<>v_hash then raise exception'FAN_WEB_CONFLICT';end if;return jsonb_build_object('id',v_post.id,'revision',v_post.revision,'replayed',true);end if;if(select count(*)from public.fan_posts where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=10 then raise exception'FAN_WEB_RATE_LIMITED';end if;v_id:=extensions.gen_random_uuid();else select*into v_post from public.fan_posts where id=p_post_id and app_user_id=p_app_user_id and celebrity_id=v_creator for update;if not found or v_post.deleted_at is not null or v_post.hidden_at is not null then raise exception'FAN_WEB_NOT_FOUND';end if;if p_expected_revision is null or v_post.revision<>p_expected_revision then raise exception'FAN_WEB_CONFLICT';end if;v_id:=p_post_id;end if;
 perform 1 from public.mobile_media_assets where id=any(v_assets)order by id for update;select(select count(*)from public.content_assets where id=any(v_assets)and app_user_id=p_app_user_id and celebrity_id=v_creator and uploaded_at is not null and deleted_at is null and cleanup_requested_at is null and notice_id is null and(post_id=v_id or(post_id is null and expires_at>clock_timestamp())))+(select count(*)from public.mobile_media_assets where id=any(v_assets)and app_user_id=p_app_user_id and ((purpose='fan_post'and kind='image')or(p_slug='kyaa-wave-fanpage'and purpose='wave_post'and kind='video'and cardinality(v_assets)=1))and state='ready'and storage_deleted_at is null and(attached_id is null or(attached_type='fan_post'and attached_id=v_id)))into v_valid;if v_valid<>cardinality(v_assets)then raise exception'MEDIA_INVALID_ASSET';end if;
 if p_post_id is null then insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(v_id,v_creator,p_app_user_id,v_body,p_visibility,p_idempotency_key,v_hash)returning*into v_post;else update public.fan_posts set body=v_body,visibility=p_visibility,revision=revision+1,updated_at=clock_timestamp()where id=v_id returning*into v_post;insert into public.content_write_events(app_user_id,kind)values(p_app_user_id,'post_edit');end if;
 update public.content_assets set deleted_at=clock_timestamp(),cleanup_requested_at=clock_timestamp(),cleanup_retry_at=clock_timestamp(),position=null where post_id=v_id and deleted_at is null and not(id=any(v_assets));update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'),position=null where attached_type='fan_post'and attached_id=v_id and not(id=any(v_assets));update public.content_assets set position=null where post_id=v_id and id=any(v_assets);update public.mobile_media_assets set position=null where attached_type='fan_post'and attached_id=v_id and id=any(v_assets);update public.content_assets a set post_id=v_id,position=(s.ord-1)::smallint from unnest(v_assets)with ordinality s(id,ord)where a.id=s.id;update public.mobile_media_assets a set attached_type='fan_post',attached_id=v_id,attached_version=v_post.revision,access_scope='fan_post',position=(s.ord-1)::smallint,updated_at=clock_timestamp()from unnest(v_assets)with ordinality s(id,ord)where a.id=s.id;return jsonb_build_object('id',v_id,'revision',v_post.revision,'replayed',false);end $$;

alter function public.fan_web_post_json(uuid,uuid,public.content_locale) rename to fan_web_post_json_before_wave_video;
create function public.fan_web_post_json(p_app_user_id uuid,p_post_id uuid,p_locale public.content_locale default 'ko') returns jsonb language sql stable security definer set search_path='' as $$
 select case when base is null then null else jsonb_set(base,'{assets}',coalesce((select jsonb_agg(item order by ord) from jsonb_array_elements(base->'assets') with ordinality x(item,ord) where not exists(select 1 from public.mobile_media_assets a where a.id=(item->>'id')::uuid and a.kind='video')),'[]'::jsonb)) || jsonb_build_object('video',(select jsonb_build_object('id',a.id,'width',a.width,'height',a.height,'durationSeconds',a.duration_seconds) from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=p_post_id and a.kind='video' and a.state='ready' and a.storage_deleted_at is null limit 1)) end
 from (select public.fan_web_post_json_before_wave_video(p_app_user_id,p_post_id,p_locale) base) x;
$$;
revoke all on function public.fan_web_post_json_before_wave_video(uuid,uuid,public.content_locale),public.fan_web_post_json(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;


create or replace function public.create_kyaa_wave_album(p_app_user_id uuid,p_slug text,p_body text,p_visibility text,p_asset_ids uuid[],p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare creator_id uuid;existing public.fan_clips%rowtype;clip_id uuid:=extensions.gen_random_uuid();normalized text:=btrim(coalesce(p_body,''));ids uuid[]:=coalesce(p_asset_ids,'{}');payload_hash text;kind_count integer;reward jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id); if p_slug is distinct from 'kyaa-wave-fanpage' or not public.kyaa_wave_checked_in(p_app_user_id) then raise exception 'FAN_WEB_FORBIDDEN'; end if;if p_idempotency_key is null or p_visibility is null or p_visibility not in('public','members')or length(normalized)>5000 or cardinality(ids)not between 1 and 30 or cardinality(ids)<>(select count(distinct x)from unnest(ids)x)then raise exception'FAN_WEB_INVALID_INPUT';end if;
 select id into creator_id from public.celebrities where slug=p_slug and status='published'and archived_at is null for share;if creator_id is null then raise exception'FAN_WEB_NOT_FOUND';end if;
 payload_hash:=encode(extensions.digest(jsonb_build_array(creator_id,normalized,p_visibility,ids)::text,'sha256'),'hex');select*into existing from public.fan_clips where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if found then if existing.create_request_hash<>payload_hash then raise exception'FAN_WEB_CONFLICT';end if;return jsonb_build_object('id',existing.id,'revision',existing.revision,'replayed',true);end if;
 if(select count(*)from public.fan_clips where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=5 then raise exception'FAN_WEB_RATE_LIMITED';end if;
 perform 1 from public.mobile_media_assets where id=any(ids)order by id for update;
 if(select count(*)from public.mobile_media_assets where id=any(ids)and app_user_id=p_app_user_id and purpose='wave_album'and state='ready'and storage_deleted_at is null and attached_id is null)<>cardinality(ids)then raise exception'MEDIA_INVALID_ASSET';end if;
 select count(distinct kind)into kind_count from public.mobile_media_assets where id=any(ids);if kind_count<>1 or(exists(select 1 from public.mobile_media_assets where id=any(ids)and kind='video')and cardinality(ids)<>1)then raise exception'MEDIA_INVALID_ASSET';end if;
 insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,first_stamp_eligible)values(clip_id,creator_id,p_app_user_id,normalized,p_visibility,p_idempotency_key,payload_hash,false);
 update public.mobile_media_assets a set attached_type='fan_clip',attached_id=clip_id,attached_version=1,access_scope='fan_clip',position=(ordered.ord-1)::smallint,updated_at=clock_timestamp()
 from unnest(ids)with ordinality ordered(id,ord)where a.id=ordered.id;
 return jsonb_build_object('id',clip_id,'revision',1,'replayed',false);
end $$;

create function public.kyaa_wave_album_json(p_app_user_id uuid,p_clip_id uuid,p_locale public.content_locale default 'ko') returns jsonb language sql stable security definer set search_path='' as $$
 select case when base is null then null else jsonb_set(base,'{author,profileId}',to_jsonb(c.app_user_id)) || jsonb_build_object('commentPreview',(
  select jsonb_build_object('id',x.id,'clipId',x.clip_id,'parentId',x.parent_id,'body',x.body,'revision',x.revision,'createdAt',x.created_at,'isOwner',coalesce(x.app_user_id=p_app_user_id,false),'author',jsonb_build_object('nickname',coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),'avatarUrl',public.public_fan_avatar_url(x.app_user_id)),'reactions',public.mobile_content_reactions_json(p_app_user_id,'fan_clip_comment',x.id))
  from public.fan_clip_comments x left join public.user_profiles profile on profile.app_user_id=x.app_user_id
  where x.clip_id=p_clip_id and x.parent_id is null and public.fan_web_content_visible(p_app_user_id,'fan_clip_comment',x.id)
  order by x.created_at desc,x.id desc limit 1
 )) end from public.fan_clips c cross join lateral (select public.mobile_content_clip_json(p_app_user_id,c.id,p_locale) base) j where c.id=p_clip_id;
$$;

create function public.read_kyaa_wave_albums(p_app_user_id uuid,p_profile_id uuid default null,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default 'ko') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if not public.kyaa_wave_checked_in(p_app_user_id) then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 if p_limit not between 1 and 50 or ((p_before is null)<>(p_before_id is null)) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 if p_profile_id is not null and (not public.kyaa_wave_checked_in(p_profile_id) or public.fan_web_blocked(p_app_user_id,p_profile_id)) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 with candidates as materialized (
  select c.id,c.created_at from public.fan_clips c join public.celebrities creator on creator.id=c.celebrity_id
  where creator.slug='kyaa-wave-fanpage' and (p_profile_id is null or c.app_user_id=p_profile_id)
  and public.kyaa_wave_checked_in(c.app_user_id) and public.fan_web_content_visible(p_app_user_id,'fan_clip',c.id)
  and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
  order by c.created_at desc,c.id desc limit p_limit+1
 ), selected as (select * from candidates order by created_at desc,id desc limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(public.kyaa_wave_album_json(p_app_user_id,s.id,p_locale) order by s.created_at desc,s.id desc) from selected s),'[]'::jsonb),'hasMore',(select count(*)>p_limit from candidates)) into result;
 return result;
end $$;

revoke all on function public.create_kyaa_wave_album(uuid,text,text,text,uuid[],uuid),public.kyaa_wave_album_json(uuid,uuid,public.content_locale),public.read_kyaa_wave_albums(uuid,uuid,timestamptz,uuid,integer,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.create_kyaa_wave_album(uuid,text,text,text,uuid[],uuid),public.kyaa_wave_album_json(uuid,uuid,public.content_locale),public.read_kyaa_wave_albums(uuid,uuid,timestamptz,uuid,integer,public.content_locale) to service_role;
create or replace function public.read_owned_kyaa_wave_missions(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt_at timestamptz; wave_id uuid;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select p.created_at into receipt_at from public.kyaa_wave_participants p
 where p.app_user_id=p_app_user_id and p.event_key='kyaa-wave-2026';
 if receipt_at is null then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 select c.id into wave_id from public.celebrities c
 where c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null;
 if wave_id is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;

 return jsonb_build_object('progress',jsonb_build_array(
  jsonb_build_object('key','checkin','status','completed'),
  jsonb_build_object('key','event-photo','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
    and (exists(select 1 from public.content_assets a where a.post_id=p.id and a.app_user_id=p_app_user_id
      and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null)
     or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=p.id
      and a.app_user_id=p_app_user_id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null))
  ) or exists(select 1 from public.fan_clips p join public.mobile_media_assets a on a.attached_type='fan_clip' and a.attached_id=p.id
   where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id and p.visibility='public'
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
   and a.kind='image' and a.state='ready' and a.storage_deleted_at is null
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','fanpage-like','status',case when exists(
   select 1 from public.fan_reactions r where r.app_user_id=p_app_user_id and r.celebrity_id=wave_id and r.business_status='completed'
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','introduction','status',case when exists(
   select 1 from public.fan_posts p where p.app_user_id=p_app_user_id and p.celebrity_id=wave_id
   and p.program_notice_id is null and p.visibility='public' and length(btrim(p.body))>0
   and p.deleted_at is null and p.hidden_at is null and p.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','friendship','status',case when exists(
   select 1 from public.social_friendships f where p_app_user_id in(f.requester_id,f.addressee_id)
   and f.celebrity_id=wave_id and f.status='accepted' and f.accepted_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','dm-greeting','status',case when exists(
   select 1 from public.social_dm_messages m
   join public.social_dm_conversations d on d.id=m.conversation_id and d.status='accepted'
   join public.social_friendships f on f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id
    and f.celebrity_id=wave_id and f.status='accepted'
   where m.sender_id=p_app_user_id and p_app_user_id in(d.user_low_id,d.user_high_id)
    and m.created_at>=receipt_at and m.hidden_at is null
    and not exists(select 1 from public.social_dm_message_deletions x where x.message_id=m.id and x.app_user_id=p_app_user_id)
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','live-cheer','status','unverified'),
  jsonb_build_object('key','insight-review','status',case when exists(
   select 1 from public.celebrity_notice_comments c where c.app_user_id=p_app_user_id
    and c.notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and c.removed_at is null and length(btrim(c.body))>0 and c.created_at>=receipt_at
  ) then 'completed' else 'pending' end),
  jsonb_build_object('key','quiz-correct','status','unverified'),
  jsonb_build_object('key','website-cheer','status','unverified')
 ));
end $$;

commit;

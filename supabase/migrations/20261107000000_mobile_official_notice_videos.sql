-- Mobile-authored official notices use the private media validation pipeline for
-- images and short videos. Older app versions may still have image assets reserved
-- as fan_post, so publication accepts that legacy image-only purpose too.
alter table public.mobile_media_assets drop constraint mobile_media_assets_purpose_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_purpose_check
  check(purpose in('fan_post','fan_clip','dm','certification','participation','support','official_post'));

create or replace function public.reserve_owned_mobile_media(
  p_app_user_id uuid,p_kind text,p_purpose text,p_content_type text,p_byte_size integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.mobile_media_assets%rowtype;v_id uuid:=extensions.gen_random_uuid();v_hash text;v_ext text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_id is null or p_kind not in('image','video')
    or p_purpose not in('fan_post','fan_clip','dm','certification','participation','support','official_post')
    or p_content_type not in('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')
    or p_byte_size not between 1 and 52428800
    or(p_kind='image'and(p_content_type not like'image/%'or p_byte_size>8388608))
    or(p_kind='video'and p_content_type not like'video/%')
    or(p_purpose in('fan_post','certification','support')and p_kind<>'image') then
    raise exception 'MEDIA_INVALID_INPUT'; end if;
  v_hash:=md5(p_kind||':'||p_purpose||':'||p_content_type||':'||p_byte_size::text);
  select * into a from public.mobile_media_assets where app_user_id=p_app_user_id and request_id=p_request_id;
  if found then
    if a.request_hash<>v_hash or a.state<>'uploading'or a.upload_expires_at<=clock_timestamp()then raise exception'MEDIA_CONFLICT';end if;
    return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'expiresAt',a.upload_expires_at,'replayed',true);
  end if;
  if(select count(*)from public.mobile_media_assets where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=20 then raise exception'MEDIA_RATE_LIMITED';end if;
  v_ext:=case p_content_type when'image/jpeg'then'jpg'when'image/png'then'png'when'image/webp'then'webp'when'video/quicktime'then'mov'else'mp4'end;
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,storage_path,thumbnail_path,request_id,request_hash)
    values(v_id,p_app_user_id,p_kind,p_purpose,p_content_type,p_byte_size,p_app_user_id::text||'/'||v_id::text||'/original.'||v_ext,p_app_user_id::text||'/'||v_id::text||'/thumbnail.webp',p_request_id,v_hash)
    returning * into a;
  return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'expiresAt',a.upload_expires_at,'replayed',false);
end $$;

create or replace function public.publish_owned_mobile_official_post(
  p_app_user_id uuid,p_slug text,p_body text,p_asset_ids uuid[],p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;v_creator uuid;v_id uuid;v_hash text;v_title text;v_document jsonb;
  v_body text:=btrim(coalesce(p_body,''));v_assets uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]);
  v_receipt public.mobile_official_post_receipts%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select a.id into v_actor from public.admin_allowlist a join public.app_users u on u.verified_email=a.email
    where u.id=p_app_user_id and u.status='active' and a.active and a.role<>'viewer' for share of a;
  if not found then raise exception 'FAN_WEB_FORBIDDEN'; end if;
  if p_idempotency_key is null or length(v_body)>5000 or cardinality(v_assets)>4
    or cardinality(v_assets)<>(select count(distinct a) from unnest(v_assets) a)
    or(v_body=''and cardinality(v_assets)=0)then raise exception'FAN_WEB_INVALID_INPUT';end if;
  select c.id into v_creator from public.celebrities c where c.slug=p_slug and c.status='published'and c.archived_at is null for share;
  if not found then raise exception'FAN_WEB_NOT_FOUND';end if;
  v_hash:=md5(jsonb_build_array(p_slug,v_body,to_jsonb(v_assets))::text);
  select * into v_receipt from public.mobile_official_post_receipts where app_user_id=p_app_user_id and request_id=p_idempotency_key;
  if found then
    if v_receipt.request_hash<>v_hash then raise exception'FAN_WEB_CONFLICT';end if;
    return jsonb_build_object('id',v_receipt.notice_id,'revision',2,'replayed',true);
  end if;
  perform 1 from public.mobile_media_assets where id=any(v_assets)order by id for update;
  if(select count(*)from public.mobile_media_assets where id=any(v_assets)and app_user_id=p_app_user_id
    and((purpose='official_post')or(purpose='fan_post'and kind='image'))
    and state='ready'and storage_deleted_at is null and cleanup_requested_at is null and attached_id is null)<>cardinality(v_assets)then
    raise exception'FAN_WEB_INVALID_ASSET';end if;
  v_document:=jsonb_build_object('type','doc','content',
    case when v_body=''then'[]'::jsonb else jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',v_body))))end
    ||coalesce((select jsonb_agg(jsonb_build_object(
      'type',case when a.kind='video'then'video'else'image'end,
      'attrs',jsonb_build_object(
        'src','/api/public/notice-media/'||a.id::text,
        'alt',coalesce(nullif(left(v_body,160),''),case when a.kind='video'then'Official video'else'Photo'end),
        'width',a.width,'height',a.height
      )||case when a.kind='video'then jsonb_build_object(
        'poster','/api/public/notice-media/'||a.id::text||'?variant=thumbnail',
        'durationSeconds',a.duration_seconds
      )else'{}'::jsonb end
    )order by x.ord)from unnest(v_assets)with ordinality x(id,ord)join public.mobile_media_assets a on a.id=x.id),'[]'::jsonb));
  v_id:=extensions.gen_random_uuid();
  v_title:=coalesce(nullif(left(v_body,160),''),(select name from public.celebrity_localizations where celebrity_id=v_creator and locale='ko'));
  v_id:=public.save_admin_celebrity_notice(p_app_user_id,v_actor,p_idempotency_key,null,null,v_creator,'app-'||v_id::text,false,
    v_title,v_document,v_title,v_document,'artist_post','public');
  update public.mobile_media_assets a set attached_type='notice',attached_id=v_id,attached_version=2,position=x.ord::smallint,
    access_scope='notice',updated_at=clock_timestamp()
    from unnest(v_assets)with ordinality x(id,ord)where a.id=x.id;
  perform public.set_admin_celebrity_notice_state(p_app_user_id,v_actor,p_idempotency_key,v_id,1,'publish',null);
  insert into public.mobile_official_post_receipts(app_user_id,request_id,notice_id,request_hash)
    values(p_app_user_id,p_idempotency_key,v_id,v_hash);
  return jsonb_build_object('id',v_id,'revision',2,'replayed',false);
end $$;

create or replace function public.authorize_public_official_media_read(p_asset_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,
    'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end)
  from public.mobile_media_assets a
  where a.id=p_asset_id and p_variant in('original','thumbnail') and a.kind in('image','video')
    and a.state='ready'and a.storage_deleted_at is null and a.cleanup_requested_at is null
    and a.attached_type='notice'and a.access_scope='notice'
    and public.fan_web_content_visible(null,'notice',a.attached_id);
$$;

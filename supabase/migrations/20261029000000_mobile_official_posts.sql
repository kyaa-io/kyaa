begin;

-- Official authors use the existing writable administrator delegation.
create table public.mobile_official_post_receipts (
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  request_id uuid not null,
  notice_id uuid not null references public.celebrity_notices(id) on delete restrict,
  request_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (app_user_id,request_id)
);
alter table public.mobile_official_post_receipts enable row level security;
revoke all on public.mobile_official_post_receipts from public,anon,authenticated;
grant select,insert,delete on public.mobile_official_post_receipts to service_role;

alter table public.mobile_media_assets drop constraint mobile_media_assets_attached_type_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_attached_type_check
  check(attached_type in('fan_post','fan_clip','dm_message','certification','participation_post','cs_message','notice'));
alter table public.mobile_media_assets drop constraint mobile_media_assets_access_scope_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_access_scope_check
  check(access_scope in('owner','fan_post','fan_clip','dm','certification','participation','support','notice'));

create function public.read_owned_mobile_official_capability(p_app_user_id uuid,p_slug text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_name text; v_can_publish boolean; v_nickname text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select l.name into v_name from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.slug=p_slug and c.status='published' and c.archived_at is null;
  if not found then return null; end if;
  select exists(select 1 from public.admin_allowlist a join public.app_users u on u.verified_email=a.email
    where u.id=p_app_user_id and u.status='active' and a.active and a.role<>'viewer') into v_can_publish;
  select nickname into v_nickname from public.user_profiles where app_user_id=p_app_user_id;
  return jsonb_build_object('canPublish',v_can_publish,'displayName',v_name,'accountName',v_nickname);
end $$;

create function public.publish_owned_mobile_official_post(p_app_user_id uuid,p_slug text,p_body text,p_asset_ids uuid[],p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_creator uuid; v_id uuid; v_hash text; v_title text; v_document jsonb;
  v_body text:=btrim(coalesce(p_body,'')); v_assets uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]);
  v_receipt public.mobile_official_post_receipts%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select a.id into v_actor from public.admin_allowlist a join public.app_users u on u.verified_email=a.email
    where u.id=p_app_user_id and u.status='active' and a.active and a.role<>'viewer' for share of a;
  if not found then raise exception 'FAN_WEB_FORBIDDEN'; end if;
  if p_idempotency_key is null or length(v_body)>5000 or cardinality(v_assets)>4
    or cardinality(v_assets)<>(select count(distinct a) from unnest(v_assets) a)
    or (v_body='' and cardinality(v_assets)=0) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  select c.id into v_creator from public.celebrities c where c.slug=p_slug and c.status='published' and c.archived_at is null for share;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  v_hash:=md5(jsonb_build_array(p_slug,v_body,to_jsonb(v_assets))::text);
  select * into v_receipt from public.mobile_official_post_receipts where app_user_id=p_app_user_id and request_id=p_idempotency_key;
  if found then
    if v_receipt.request_hash<>v_hash then raise exception 'FAN_WEB_CONFLICT'; end if;
    return jsonb_build_object('id',v_receipt.notice_id,'revision',2,'replayed',true);
  end if;
  perform 1 from public.mobile_media_assets where id=any(v_assets) order by id for update;
  if (select count(*) from public.mobile_media_assets where id=any(v_assets) and app_user_id=p_app_user_id
    and purpose='fan_post' and kind='image' and state='ready' and storage_deleted_at is null
    and cleanup_requested_at is null and attached_id is null)<>cardinality(v_assets) then raise exception 'FAN_WEB_INVALID_ASSET'; end if;
  v_document:=jsonb_build_object('type','doc','content',
    case when v_body='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',v_body)))) end
    ||coalesce((select jsonb_agg(jsonb_build_object('type','image','attrs',jsonb_build_object('src','/api/public/notice-media/'||a.id::text,'alt',coalesce(nullif(left(v_body,160),''),'Photo'),'width',a.width,'height',a.height)) order by x.ord)
      from unnest(v_assets) with ordinality x(id,ord) join public.mobile_media_assets a on a.id=x.id),'[]'::jsonb));
  v_id:=extensions.gen_random_uuid();
  v_title:=coalesce(nullif(left(v_body,160),''),(select name from public.celebrity_localizations where celebrity_id=v_creator and locale='ko'));
  v_id:=public.save_admin_celebrity_notice(p_app_user_id,v_actor,p_idempotency_key,null,null,v_creator,'app-'||v_id::text,false,
    v_title,v_document,v_title,v_document,'artist_post','public');
  -- A public image resolves only while its official notice remains published.
  update public.mobile_media_assets a set attached_type='notice',attached_id=v_id,attached_version=2,position=x.ord::smallint,
    access_scope='notice',updated_at=clock_timestamp()
    from unnest(v_assets) with ordinality x(id,ord) where a.id=x.id;
  perform public.set_admin_celebrity_notice_state(p_app_user_id,v_actor,p_idempotency_key,v_id,1,'publish',null);
  insert into public.mobile_official_post_receipts(app_user_id,request_id,notice_id,request_hash) values(p_app_user_id,p_idempotency_key,v_id,v_hash);
  return jsonb_build_object('id',v_id,'revision',2,'replayed',false);
end $$;

create function public.read_owned_mobile_official_post_result(p_app_user_id uuid,p_slug text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select r.notice_id into v_id from public.mobile_official_post_receipts r join public.celebrity_notices n on n.id=r.notice_id
    join public.celebrities c on c.id=n.celebrity_id where r.app_user_id=p_app_user_id and r.request_id=p_idempotency_key and c.slug=p_slug;
  if not found then return null; end if;
  return jsonb_build_object('id',v_id,'revision',2,'replayed',true);
end $$;

create function public.authorize_public_official_media_read(p_asset_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('storagePath',case when p_variant='thumbnail' then a.thumbnail_path else a.storage_path end,
    'contentType',case when p_variant='thumbnail' then 'image/webp' else a.content_type end)
  from public.mobile_media_assets a where a.id=p_asset_id and p_variant in('original','thumbnail') and a.kind='image'
    and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null
    and a.attached_type='notice' and a.access_scope='notice' and public.fan_web_content_visible(null,'notice',a.attached_id);
$$;

revoke all on function public.read_owned_mobile_official_capability(uuid,text,public.content_locale),
  public.publish_owned_mobile_official_post(uuid,text,text,uuid[],uuid),public.authorize_public_official_media_read(uuid,text),public.read_owned_mobile_official_post_result(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_owned_mobile_official_capability(uuid,text,public.content_locale),
  public.publish_owned_mobile_official_post(uuid,text,text,uuid[],uuid),public.authorize_public_official_media_read(uuid,text),public.read_owned_mobile_official_post_result(uuid,text,uuid) to service_role;

commit;

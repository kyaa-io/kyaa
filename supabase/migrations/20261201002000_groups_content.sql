begin;
alter table public.group_applications drop constraint group_applications_status_check;
alter table public.group_applications add constraint group_applications_status_check check(status in('submitted','reviewing','changes_requested','approved','rejected'));
alter table public.group_posts add column category text not null default 'free' check(category in ('free','notice'));
create table public.group_comments(
 id uuid primary key default extensions.gen_random_uuid(),post_id uuid not null references public.group_posts(id),
 author_id uuid not null references public.app_users(id),body text not null check(length(btrim(body)) between 1 and 2000),
 anonymous boolean not null,parent_id uuid references public.group_comments(id),created_at timestamptz not null default clock_timestamp(),removed_at timestamptz
);
create table public.group_notification_settings(page_id uuid references public.group_pages(id),app_user_id uuid references public.app_users(id),enabled boolean not null default true,primary key(page_id,app_user_id));
create index group_comments_cursor on public.group_comments(post_id,created_at,id) where removed_at is null;
create table public.group_post_reactions(post_id uuid references public.group_posts(id),app_user_id uuid references public.app_users(id),created_at timestamptz not null default now(),primary key(post_id,app_user_id));
create table public.group_post_views(post_id uuid references public.group_posts(id),app_user_id uuid references public.app_users(id),created_at timestamptz not null default now(),primary key(post_id,app_user_id));
create table public.group_reports(
 id uuid primary key default extensions.gen_random_uuid(),page_id uuid not null references public.group_pages(id),
 reporter_id uuid not null references public.app_users(id),target_type text not null check(target_type in ('post','comment','message')),target_id uuid not null,
 reason text not null check(length(btrim(reason)) between 1 and 1000),status text not null default 'submitted' check(status in ('submitted','reviewing','action_requested','resolved')),
 resolution text,reviewed_by uuid references public.admin_allowlist(id),created_at timestamptz not null default now(),unique(reporter_id,target_type,target_id)
);
create table public.group_artist_bindings(page_id uuid references public.group_pages(id),app_user_id uuid references public.app_users(id),verified_by uuid not null references public.admin_allowlist(id),primary key(page_id,app_user_id));
create table public.group_artist_presence_settings(app_user_id uuid primary key references public.app_users(id),enabled boolean not null default false);
create table public.group_presence(page_id uuid references public.group_pages(id),app_user_id uuid references public.app_users(id),seen_at timestamptz not null default now(),primary key(page_id,app_user_id));
create index group_presence_recent on public.group_presence(page_id,seen_at);
create table public.group_visits(page_id uuid references public.group_pages(id),app_user_id uuid references public.app_users(id),day date not null,primary key(page_id,app_user_id,day));
alter table public.group_rooms add column opens_at timestamptz,add column closes_at timestamptz,add constraint group_room_times check(opens_at is null or closes_at is null or closes_at>opens_at);
create table public.group_room_reads(room_id uuid references public.group_rooms(id),app_user_id uuid references public.app_users(id),read_at timestamptz not null default now(),primary key(room_id,app_user_id));

create function public.group_scope_visible(p_actor uuid,p_page uuid)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_page and g.status='published'
 and(g.celebrity_id is null or c.status='published' and c.archived_at is null)
 and(c.slug is distinct from 'kyaa-wave-fanpage' or coalesce(public.kyaa_wave_checked_in(p_actor),false)))
$$;
alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)rename to groups_dispatch_before_content;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare page uuid:=p_page_id;result jsonb;
begin
 if p_operation='resolve'then select g.id into page from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where c.slug=p_input->>'slug';end if;
 if page is not null and not public.group_scope_visible(p_actor,page)then raise exception 'GROUPS_NOT_FOUND';end if;
 result:=public.groups_dispatch_before_content(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation='directory'then return jsonb_set(result,'{items}',coalesce((select jsonb_agg(item)from jsonb_array_elements(result->'items')item where public.group_scope_visible(p_actor,(item->>'id')::uuid)),'[]'::jsonb));end if;
 return result;
end $$;
revoke all on function public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid),public.group_scope_visible(uuid,uuid)from public,anon,authenticated,service_role;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)to service_role;

create or replace function public.group_room_allowed(p_actor uuid,p_page uuid,p_minimum text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id join public.app_users u on u.id=m.app_user_id and u.status='active'
 where m.page_id=p_page and m.app_user_id=p_actor and public.group_scope_visible(p_actor,g.id) and (g.kind<>'fan' or exists(select 1 from public.group_artist_bindings b where b.page_id=g.id and b.app_user_id=p_actor) or (
 exists(select 1 from public.fan_passports p where p.app_user_id=p_actor and p.celebrity_id=g.celebrity_id and p.business_status='issued')
 and public.fan_level_rank(public.get_fan_effective_tier(p_actor,g.celebrity_id))>=public.fan_level_rank(p_minimum))))
$$;

create function public.group_post_visible(p_actor uuid,p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_posts p join public.group_pages g on g.id=p.page_id
 where p.id=p_post and p.removed_at is null and(p_actor is null or not public.fan_web_blocked(p_actor,p.author_id))and public.group_scope_visible(p_actor,g.id) and g.status='published' and (g.celebrity_id is null or exists(select 1 from public.celebrities c where c.id=g.celebrity_id and c.status='published' and c.archived_at is null))
 and (p.visibility='public' or exists(select 1 from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id and m.app_user_id=p_actor)))
$$;

-- Extend the existing private validation pipeline without weakening previous purposes.
do $$ declare item text; definition text; begin
 foreach item in array array['purpose','attached_type','access_scope'] loop
  select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.mobile_media_assets'::regclass and conname='mobile_media_assets_'||item||'_check';
  if definition is null then raise exception 'MEDIA_CONSTRAINT_MISSING';end if;
  execute format('alter table public.mobile_media_assets drop constraint %I','mobile_media_assets_'||item||'_check');
  execute format('alter table public.mobile_media_assets add constraint %I CHECK ((%s) OR %I = ''group_post'')','mobile_media_assets_'||item||'_check',substring(definition from 8 for length(definition)-8),item);
  if item='attached_type'then alter table public.mobile_media_assets drop constraint mobile_media_assets_attached_type_check;execute format('alter table public.mobile_media_assets add constraint mobile_media_assets_attached_type_check CHECK ((%s) OR attached_type in(''group_post'',''group_comment''))',substring(definition from 8 for length(definition)-8));end if;
 end loop;
end $$;

create or replace function public.reserve_owned_mobile_media(
  p_app_user_id uuid,p_kind text,p_purpose text,p_content_type text,p_byte_size integer,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.mobile_media_assets%rowtype;v_id uuid:=extensions.gen_random_uuid();v_hash text;v_ext text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_id is null or p_kind not in('image','video')
    or p_purpose not in('fan_post','fan_clip','dm','certification','participation','support','official_post','wave_album','wave_post','group_post')
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

create function public.authorize_group_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.mobile_media_assets;
begin
 if p_variant not in ('original','thumbnail') then raise exception 'MEDIA_INVALID_INPUT';end if;
 if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id);end if;
 select * into a from public.mobile_media_assets where id=p_asset_id and purpose='group_post' and attached_type in('group_post','group_comment') and access_scope='group_post' and state='ready' and storage_deleted_at is null;
 if not found then return null;end if;
 if a.attached_type='group_post' then
  if not public.group_post_visible(p_app_user_id,a.attached_id)then return null;end if;
 else
  if not exists(select 1 from public.group_comments c where c.id=a.attached_id and c.removed_at is null and(p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,c.author_id))and public.group_post_visible(p_app_user_id,c.post_id))then return null;end if;
 end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail' then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail' then 'image/webp' else a.content_type end);
end $$;

alter function public.authorize_mobile_media_read(uuid,uuid,text) rename to authorize_mobile_media_read_before_groups;
create function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.mobile_media_assets where id=p_asset_id and purpose='group_post' and attached_id is not null) then return public.authorize_group_media_read(p_app_user_id,p_asset_id,p_variant);end if;
 return public.authorize_mobile_media_read_before_groups(p_app_user_id,p_asset_id,p_variant);
end $$;

create function public.group_post_view(p_id uuid,p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.group_post_json(p.id)||jsonb_build_object('category',p.category,'likeCount',(select count(*) from public.group_post_reactions where post_id=p.id),'liked',exists(select 1 from public.group_post_reactions where post_id=p.id and app_user_id=p_actor),
 'viewCount',(select count(*) from public.group_post_views where post_id=p.id),'commentCount',(select count(*) from public.group_comments where post_id=p.id and removed_at is null),
 'canEdit',p.author_id=p_actor and exists(select 1 from public.group_memberships where page_id=p.page_id and app_user_id=p_actor),
 'canDelete',coalesce(p.author_id=p_actor or exists(select 1 from public.group_memberships where page_id=p.page_id and app_user_id=p_actor and role in ('owner','manager')),false),
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height) order by a.position,a.id) from public.mobile_media_assets a where a.attached_type='group_post' and a.attached_id=p.id and a.state='ready' and a.storage_deleted_at is null),'[]'::jsonb))
 from public.group_posts p where p.id=p_id
$$;

create function public.group_notification_page(p_target_type text,p_target_id uuid)returns uuid language sql stable security definer set search_path=''as $$
 select case p_target_type
 when 'group_comment'then(select p.page_id from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=p_target_id)
 when 'fan_post_comment'then(select g.id from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id join public.group_pages g on g.celebrity_id=p.celebrity_id where c.id=p_target_id)
 when 'notice'then(select g.id from public.celebrity_notices n join public.group_pages g on g.celebrity_id=n.celebrity_id where n.id=p_target_id)
 when 'schedule'then(select g.id from public.celebrity_schedules s join public.group_pages g on g.celebrity_id=s.celebrity_id where s.id=p_target_id)end
$$;

create function public.authorize_group_report_media_read(p_actor uuid,p_admin_id uuid,p_page_id uuid,p_report_id uuid,p_asset_id uuid,p_variant text,p_request_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.mobile_media_assets;gr public.group_reports;
begin
 begin perform public.assert_active_admin(p_actor,p_admin_id,false);exception when others then raise exception 'GROUPS_FORBIDDEN';end;
 if p_variant not in('original','thumbnail')then raise exception 'GROUPS_INVALID_REQUEST';end if;
 select * into gr from public.group_reports where id=p_report_id and page_id=p_page_id;
 if not found then return null;end if;
 select * into a from public.mobile_media_assets where id=p_asset_id and purpose='group_post'and state='ready'and storage_deleted_at is null and attached_id=gr.target_id and access_scope='group_post'and attached_type=case gr.target_type when'post'then'group_post'when'comment'then'group_comment'else''end;
 if not found then return null;end if;
 if gr.target_type='post'and not exists(select 1 from public.group_posts where id=gr.target_id and page_id=p_page_id and removed_at is null)then return null;end if;
 if gr.target_type='comment'and not exists(select 1 from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=gr.target_id and p.page_id=p_page_id and c.removed_at is null and p.removed_at is null)then return null;end if;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.report.asset.read','group_report',gr.id::text,p_request_id,jsonb_build_object('assetId',a.id,'variant',p_variant));
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);
end $$;

create function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare g public.group_pages; p public.group_posts; c public.group_comments; v_role text; result jsonb; new_id uuid; req uuid; saved public.group_action_receipts; payload jsonb;
 v_assets uuid[]; n integer; v_limit integer; v_cursor uuid; last_at timestamptz;
begin
 if p_actor is not null then perform public.fan_web_lock_active_user(p_actor);end if;
 if p_operation in ('admin-reports','admin-applications','resolve-report','report-evidence','artist-bind','artist-unbind','artist-bindings','review') then
  begin perform public.assert_active_admin(p_actor,p_admin_id,p_operation not in('admin-reports','admin-applications','artist-bindings','report-evidence'));exception when others then raise exception 'GROUPS_FORBIDDEN';end;
 end if;
 if p_operation='review' then
  if p_input->>'action'<>'start_review' then return public.groups_dispatch(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);end if;
  req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'GROUPS_INVALID_REQUEST';end if;
  perform public.social_request_lock(p_actor,req);
  payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'input',p_input);
  select * into saved from public.group_action_receipts where actor_id=p_actor and request_id=req;
  if found then if saved.operation<>'review' or saved.payload<>payload then raise exception 'GROUPS_CONFLICT';end if;return saved.response;end if;
  update public.group_applications set status='reviewing',reviewed_by=p_admin_id where id=p_item_id and status in('submitted','changes_requested','reviewing');
  if not found then raise exception 'GROUPS_CONFLICT';end if;
  select jsonb_build_object('id',id,'status',status,'pageId',page_id)into result from public.group_applications where id=p_item_id;
  insert into public.group_action_receipts(actor_id,request_id,operation,payload,response)values(p_actor,req,'review',payload,result);return result;
 end if;
 if p_operation in ('presence-setting','set-presence-setting') then
  if p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
  if p_operation='set-presence-setting' then
   if not exists(select 1 from public.group_artist_bindings where app_user_id=p_actor) then raise exception 'GROUPS_FORBIDDEN';end if;
   insert into public.group_artist_presence_settings values(p_actor,(p_input->>'enabled')::boolean) on conflict(app_user_id) do update set enabled=excluded.enabled;
  end if;
  return jsonb_build_object('enabled',coalesce((select enabled from public.group_artist_presence_settings where app_user_id=p_actor),false),'canConfigure',exists(select 1 from public.group_artist_bindings where app_user_id=p_actor));
 end if;
 if p_operation in('applications','admin-applications','admin-reports') then
  if p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100);v_cursor:=(p_input->>'cursor')::uuid;
  if p_operation='admin-reports' then
   with selected as(select * from public.group_reports where(v_cursor is null or(created_at,id)<(select created_at,id from public.group_reports where id=v_cursor))order by created_at desc,id desc limit v_limit+1),shown as(select * from selected order by created_at desc,id desc limit v_limit)
   select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('targetPostId',case when x.target_type='post' then x.target_id when x.target_type='comment' then(select post_id from public.group_comments where id=x.target_id)end,'targetRoomId',case when x.target_type='message'then(select room_id from public.group_messages where id=x.target_id)end)order by created_at desc,id desc)from shown x),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>v_limit then(select id from shown order by created_at,id limit 1)end)into result;
  else
   with selected as(select * from public.group_applications where(p_operation='admin-applications' or applicant_id=p_actor)and(v_cursor is null or(created_at,id)<(select created_at,id from public.group_applications where id=v_cursor and(p_operation='admin-applications' or applicant_id=p_actor)))order by created_at desc,id desc limit v_limit+1),shown as(select * from selected order by created_at desc,id desc limit v_limit)
   select jsonb_build_object('items',coalesce((select jsonb_agg(case when p_operation='admin-applications' then to_jsonb(x)else jsonb_build_object('id',id,'kind',kind,'name',name,'description',description,'imageUrl',image_url,'question',question,'status',status,'reason',reason,'pageId',page_id,'createdAt',created_at)end order by created_at desc,id desc)from shown x),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>v_limit then(select id from shown order by created_at,id limit 1)end)into result;
  end if;
  return result;
 end if;
 if p_page_id is null then raise exception 'GROUPS_NOT_FOUND';end if;
 if p_operation not in ('posts','post-detail','comments','presence') then perform pg_advisory_xact_lock(hashtextextended('groups-page:'||p_page_id::text,0));end if;
 if p_operation not in('resolve-report','report-evidence','artist-bind','artist-unbind','artist-bindings')then perform public.groups_dispatch('detail',p_actor,p_page_id);end if;
 select * into g from public.group_pages where id=p_page_id;
 if not found then raise exception 'GROUPS_NOT_FOUND';end if;
 select m.role into v_role from public.group_memberships m where m.page_id=g.id and m.app_user_id=p_actor;
 if p_operation in ('post','post-edit','comment','comment-remove','reaction','room-state','report','heartbeat') and p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_operation in('page-reports','page-resolve-report')and coalesce(v_role,'')not in('owner','manager')then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_operation in ('post','post-edit','comment','reaction') and v_role is null then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_operation in ('post','post-edit','comment','reaction','room-state','report','resolve-report','page-resolve-report','artist-bind','artist-unbind') then
  req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'GROUPS_INVALID_REQUEST';end if;
  perform public.social_request_lock(p_actor,req);
  payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'input',p_input);
  select * into saved from public.group_action_receipts where actor_id=p_actor and request_id=req;
  if found then if saved.operation<>p_operation or saved.payload<>payload then raise exception 'GROUPS_CONFLICT';end if;if p_operation in('post','post-edit')and not public.group_post_visible(p_actor,(saved.response->>'id')::uuid)then raise exception 'GROUPS_NOT_FOUND';end if;return saved.response;end if;
 end if;
 if p_operation in ('post-detail','comments','comment','reaction','post-edit') then
  select * into p from public.group_posts where id=p_item_id and page_id=g.id;
  if not found or not public.group_post_visible(p_actor,p.id) then raise exception 'GROUPS_NOT_FOUND';end if;
 end if;
 case p_operation
 when 'posts' then
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100);v_cursor:=(p_input->>'cursor')::uuid;
  with selected as(
   select p.id,p.created_at,p.category,(select count(*) from public.group_post_reactions where post_id=p.id) likes from public.group_posts p
   where p.page_id=g.id and public.group_post_visible(p_actor,p.id)
   and (coalesce(p_input->>'search','')='' or p.title ilike '%'||(p_input->>'search')||'%')
   and (coalesce(p_input->>'category','all')='all' or p.category=p_input->>'category')
  ),ranked as(select *,row_number() over(order by (category='notice') desc,case when p_input->>'sort'='popular' then likes end desc nulls last,created_at desc,id) rn from selected),
  sliced as(select * from ranked where rn>coalesce((select rn from ranked where id=v_cursor),0) order by rn limit v_limit+1),shown as(select * from sliced order by rn limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(public.group_post_view(id,p_actor) order by rn) from shown),'[]'::jsonb),'nextCursor',case when(select count(*) from sliced)>v_limit then(select id from shown order by rn desc limit 1)end) into result;
 when 'post-detail' then
  if p_actor is not null then insert into public.group_post_views values(p.id,p_actor,now()) on conflict do nothing;end if;
  result:=public.group_post_view(p.id,p_actor);
 when 'post','post-edit' then
  if coalesce(p_input->>'category',p.category,'free')='notice' and coalesce(v_role,'') not in ('owner','manager') then raise exception 'GROUPS_FORBIDDEN';end if;
  if p_operation='post-edit' then
   if p.author_id<>p_actor then raise exception 'GROUPS_FORBIDDEN';end if;new_id:=p.id;
  else new_id:=extensions.gen_random_uuid();end if;
  if p_operation='post-edit' and not(p_input?'assetIds')then
   select coalesce(array_agg(id order by position,id),'{}'::uuid[])into v_assets from public.mobile_media_assets where attached_type='group_post' and attached_id=new_id and state='ready' and storage_deleted_at is null;
  else select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_assets from jsonb_array_elements_text(coalesce(p_input->'assetIds','[]'::jsonb));end if;
  if cardinality(v_assets)>5 or cardinality(v_assets)<>(select count(distinct id)from unnest(v_assets)id)then raise exception 'GROUPS_INVALID_REQUEST';end if;
  perform 1 from public.mobile_media_assets where id=any(v_assets) order by id for update;
  select count(*) into n from public.mobile_media_assets where id=any(v_assets) and app_user_id=p_actor and purpose='group_post' and state='ready' and storage_deleted_at is null and (attached_id is null or attached_type='group_post' and attached_id=new_id);
  if n<>cardinality(v_assets)then raise exception 'GROUPS_INVALID_REQUEST';end if;
  if p_operation='post' then
   insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,category) values(new_id,g.id,p_actor,p_input->>'title',p_input->>'body',p_input->>'visibility',g.anonymous,coalesce(p_input->>'category','free'));
  else update public.group_posts set title=p_input->>'title',body=p_input->>'body',visibility=p_input->>'visibility',category=coalesce(p_input->>'category',category) where id=new_id;end if;
  update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes'),position=null where attached_type='group_post' and attached_id=new_id and not(id=any(v_assets));
  update public.mobile_media_assets a set attached_type='group_post',attached_id=new_id,attached_version=1,access_scope='group_post',position=(s.ord-1)::smallint,updated_at=now() from unnest(v_assets)with ordinality s(id,ord) where a.id=s.id;
  result:=public.group_post_view(new_id,p_actor);
 when 'notifications','set-notifications' then
  if v_role is null then raise exception 'GROUPS_FORBIDDEN';end if;
  if p_operation='set-notifications'then insert into public.group_notification_settings values(g.id,p_actor,(p_input->>'enabled')::boolean)on conflict(page_id,app_user_id)do update set enabled=excluded.enabled;
   if not(p_input->>'enabled')::boolean then delete from public.fan_web_notification_intents where recipient_app_user_id=p_actor and public.group_notification_page(target_type,target_id)=g.id;end if;end if;
  result:=jsonb_build_object('enabled',coalesce((select enabled from public.group_notification_settings where page_id=g.id and app_user_id=p_actor),true));
 when 'room-read' then
  if not exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and r.status in('open','readonly')and(r.closes_at is null or r.closes_at>now())and public.group_room_allowed(p_actor,g.id,r.minimum_tier))then raise exception 'GROUPS_NOT_FOUND';end if;
  select max(created_at)into last_at from public.group_messages where room_id=p_item_id;
  if last_at is not null then insert into public.group_room_reads values(p_item_id,p_actor,last_at)on conflict(room_id,app_user_id)do update set read_at=greatest(public.group_room_reads.read_at,excluded.read_at);end if;
  result:=jsonb_build_object('readAt',last_at);
 when 'comments' then
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100);v_cursor:=(p_input->>'cursor')::uuid;
  with selected as(select * from public.group_comments where post_id=p.id and removed_at is null and(p_actor is null or not public.fan_web_blocked(p_actor,author_id))and (v_cursor is null or(created_at,id)>(select created_at,id from public.group_comments where id=v_cursor and post_id=p.id)) order by created_at,id limit v_limit+1),
  shown as(select * from selected order by created_at,id limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'parentId',c.parent_id,'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height)order by a.position,a.id)from public.mobile_media_assets a where a.attached_type='group_comment'and a.attached_id=c.id and a.state='ready'and a.storage_deleted_at is null),'[]'::jsonb),'body',c.body,'profileId',case when c.anonymous then null else c.author_id end,'nickname',case when c.anonymous then '익명' else coalesce(u.nickname,'팬')end,'avatarUrl',case when c.anonymous then null else public.public_fan_avatar_url(c.author_id)end,'anonymous',c.anonymous,'createdAt',c.created_at,'canDelete',coalesce(c.author_id=p_actor or coalesce(v_role,'')in('owner','manager'),false))order by c.created_at,c.id) from shown c left join public.user_profiles u on u.app_user_id=c.author_id),'[]'::jsonb),
  'nextCursor',case when(select count(*)from selected)>v_limit then(select id from shown order by created_at desc,id desc limit 1)end)into result;
 when 'comment' then
  if p_input->>'parentId'is not null and not exists(select 1 from public.group_comments where id=(p_input->>'parentId')::uuid and post_id=p.id and parent_id is null and removed_at is null)then raise exception 'GROUPS_INVALID_REQUEST';end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[])into v_assets from jsonb_array_elements_text(coalesce(p_input->'assetIds','[]'::jsonb));
  if cardinality(v_assets)>5 or cardinality(v_assets)<>(select count(distinct id)from unnest(v_assets)id)then raise exception 'GROUPS_INVALID_REQUEST';end if;
  perform 1 from public.mobile_media_assets where id=any(v_assets)order by id for update;
  if(select count(*)from public.mobile_media_assets where id=any(v_assets)and app_user_id=p_actor and purpose='group_post'and state='ready'and storage_deleted_at is null and attached_id is null)<>cardinality(v_assets)then raise exception 'GROUPS_INVALID_REQUEST';end if;
  insert into public.group_comments(post_id,author_id,body,anonymous,parent_id)values(p.id,p_actor,p_input->>'body',g.anonymous,(p_input->>'parentId')::uuid)returning id into new_id;
  update public.mobile_media_assets a set attached_type='group_comment',attached_id=new_id,attached_version=1,access_scope='group_post',position=(s.ord-1)::smallint,updated_at=now()from unnest(v_assets)with ordinality s(id,ord)where a.id=s.id;
  result:=jsonb_build_object('id',new_id);
 when 'post-remove' then
  result:=public.groups_dispatch('post-remove',p_actor,p_page_id,p_item_id,p_input,p_admin_id);
  update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval '5 minutes') where attached_type='group_post' and attached_id=p_item_id;
 when 'comment-remove' then
  select c.* into c from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=p_item_id and p.page_id=g.id and(not(p_input?'postId')or c.post_id=(p_input->>'postId')::uuid);
  if not found or(c.author_id<>p_actor and coalesce(v_role,'')not in('owner','manager'))then raise exception 'GROUPS_NOT_FOUND';end if;
  update public.group_comments set removed_at=now()where id=c.id or parent_id=c.id;result:=jsonb_build_object('removed',true);
 when 'reaction' then
  if(p_input->>'liked')::boolean then insert into public.group_post_reactions values(p.id,p_actor,now())on conflict do nothing;else delete from public.group_post_reactions where post_id=p.id and app_user_id=p_actor;end if;
  result:=jsonb_build_object('liked',(p_input->>'liked')::boolean,'count',(select count(*)from public.group_post_reactions where post_id=p.id));
 when 'rooms','messages','message' then
  update public.group_rooms set status='open' where page_id=g.id and status='scheduled' and opens_at<=now();
  update public.group_rooms set status='closed' where page_id=g.id and status in('open','readonly') and closes_at<=now();
  if p_operation in('messages','message')and not exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_allowed(p_actor,g.id,r.minimum_tier)and r.status in('open','readonly')and(p_operation='messages'or r.status='open'))then raise exception 'GROUPS_NOT_FOUND';end if;
  result:=public.groups_dispatch(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
  if p_operation='rooms' then
   select jsonb_build_object('items',coalesce(jsonb_agg(item||jsonb_build_object('opensAt',(select opens_at from public.group_rooms where id=(item->>'id')::uuid),'closesAt',(select closes_at from public.group_rooms where id=(item->>'id')::uuid),'canEnter',(item->>'canEnter')::boolean and item->>'status' in('open','readonly'),'unreadCount',case when(item->>'canEnter')::boolean and item->>'status' in('open','readonly') then(select count(*)from public.group_messages where room_id=(item->>'id')::uuid and removed_at is null and not public.fan_web_blocked(p_actor,author_id)and author_id<>p_actor and created_at>coalesce((select read_at from public.group_room_reads where room_id=(item->>'id')::uuid and app_user_id=p_actor),'-infinity'::timestamptz))end,
    'latestMessage',case when(item->>'canEnter')::boolean and item->>'status' in('open','readonly') then(select body from public.group_messages where room_id=(item->>'id')::uuid and removed_at is null and not public.fan_web_blocked(p_actor,author_id)order by created_at desc,id desc limit 1)end)),'[]'::jsonb))into result from jsonb_array_elements(result->'items')item;
  elsif p_operation='messages' then
   select max((item->>'createdAt')::timestamptz)into last_at from jsonb_array_elements(result->'items')item;
   if last_at is not null then insert into public.group_room_reads values(p_item_id,p_actor,last_at)on conflict(room_id,app_user_id)do update set read_at=greatest(public.group_room_reads.read_at,excluded.read_at);end if;
  end if;
 when 'room-state' then
  if coalesce(v_role,'')not in('owner','manager')then raise exception 'GROUPS_FORBIDDEN';end if;
  update public.group_rooms set name=p_input->>'name',minimum_tier=p_input->>'minimumTier',status=p_input->>'status',opens_at=case when p_input?'opensAt'then(p_input->>'opensAt')::timestamptz else opens_at end,closes_at=case when p_input?'closesAt'then(p_input->>'closesAt')::timestamptz else closes_at end where id=p_item_id and page_id=g.id;
  if not found then raise exception 'GROUPS_NOT_FOUND';end if;result:=jsonb_build_object('updated',true);
 when 'report' then
  if p_input->>'targetType'='post' then
   if not exists(select 1 from public.group_posts where id=(p_input->>'targetId')::uuid and page_id=g.id and public.group_post_visible(p_actor,id))then raise exception 'GROUPS_NOT_FOUND';end if;
  elsif p_input->>'targetType'='comment' then
   if not exists(select 1 from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=(p_input->>'targetId')::uuid and p.page_id=g.id and c.removed_at is null and public.group_post_visible(p_actor,p.id))then raise exception 'GROUPS_NOT_FOUND';end if;
  elsif p_input->>'targetType'='message' then
   if not exists(select 1 from public.group_messages m join public.group_rooms r on r.id=m.room_id where m.id=(p_input->>'targetId')::uuid and m.removed_at is null and r.page_id=g.id and public.group_room_allowed(p_actor,g.id,r.minimum_tier))then raise exception 'GROUPS_NOT_FOUND';end if;
  else raise exception 'GROUPS_INVALID_REQUEST';end if;
  insert into public.group_reports(page_id,reporter_id,target_type,target_id,reason)values(g.id,p_actor,p_input->>'targetType',(p_input->>'targetId')::uuid,p_input->>'reason')on conflict(reporter_id,target_type,target_id)do update set reason=excluded.reason returning id into new_id;
  result:=jsonb_build_object('id',new_id,'status','submitted');
 when 'page-reports' then
  v_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100);v_cursor:=(p_input->>'cursor')::uuid;
  with selected as(select * from public.group_reports where page_id=g.id and(v_cursor is null or(created_at,id)<(select created_at,id from public.group_reports where id=v_cursor and page_id=g.id))order by created_at desc,id desc limit v_limit+1),shown as(select * from selected order by created_at desc,id desc limit v_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'targetType',target_type,'targetId',target_id,'reason',reason,'status',status,'createdAt',created_at,'targetPostId',case when target_type='post'then target_id when target_type='comment'then(select post_id from public.group_comments where id=x.target_id)end,'targetRoomId',case when target_type='message'then(select room_id from public.group_messages where id=x.target_id)end)order by created_at desc,id desc)from shown x),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>v_limit then(select id from shown order by created_at,id limit 1)end)into result;
 when 'report-evidence' then
  select case target_type when 'post' then(select jsonb_build_object('title',p.title,'body',case when p.removed_at is null then p.body end,'removed',p.removed_at is not null)from public.group_posts p where p.id=gr.target_id and p.page_id=g.id)
   when 'comment' then(select jsonb_build_object('body',case when c.removed_at is null then c.body end,'removed',c.removed_at is not null,'postId',c.post_id)from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=gr.target_id and p.page_id=g.id)
   when 'message' then(select jsonb_build_object('body',case when m.removed_at is null then m.body end,'removed',m.removed_at is not null,'roomId',m.room_id)from public.group_messages m join public.group_rooms r on r.id=m.room_id where m.id=gr.target_id and r.page_id=g.id)end||jsonb_build_object('reportId',gr.id,'targetType',gr.target_type,'targetId',gr.target_id)into result from public.group_reports gr where gr.id=p_item_id and gr.page_id=g.id;
  if result is null then raise exception 'GROUPS_NOT_FOUND';end if;
  select result||jsonb_build_object('attachments',coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind)order by a.position,a.id),'[]'::jsonb))into result from public.mobile_media_assets a where a.purpose='group_post'and a.state='ready'and a.storage_deleted_at is null and not(result->>'removed')::boolean and a.attached_id=(result->>'targetId')::uuid and a.attached_type=case result->>'targetType'when 'post'then'group_post'when'comment'then'group_comment'else''end;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.report.evidence.read','group_report',p_item_id::text,extensions.gen_random_uuid(),jsonb_build_object('pageId',g.id,'targetType',result->>'targetType'));
 when 'resolve-report','page-resolve-report' then
  update public.group_reports set status=p_input->>'status',resolution=p_input->>'resolution',reviewed_by=p_admin_id where id=p_item_id and page_id=g.id;
  if not found then raise exception 'GROUPS_NOT_FOUND';end if;
  if(p_input->>'remove')::boolean then
   if exists(select 1 from public.group_reports where id=p_item_id and target_type='post')then update public.group_posts set removed_at=now()where id=(select target_id from public.group_reports where id=p_item_id);end if;
   if exists(select 1 from public.group_reports where id=p_item_id and target_type='comment')then update public.group_comments set removed_at=now()where id=(select target_id from public.group_reports where id=p_item_id)or parent_id=(select target_id from public.group_reports where id=p_item_id);end if;
   if exists(select 1 from public.group_reports where id=p_item_id and target_type='message')then
    update public.group_messages set removed_at=now()where id=(select target_id from public.group_reports where id=p_item_id);
    update public.group_action_receipts set response=jsonb_build_object('id',response->>'id','removed',true)where operation='message'and response->>'id'=(select target_id::text from public.group_reports where id=p_item_id);
   end if;
  end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.report.resolve','group_report',p_item_id::text,req,jsonb_build_object('status',p_input->>'status','removed',p_input->'remove'));
  result:=jsonb_build_object('updated',true);
 when 'artist-bindings' then
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('appUserId',b.app_user_id,'nickname',up.nickname,'avatarUrl','/images/avatars/'||coalesce(av.selected_character_id,'star-pink')||'.webp','verifiedBy',b.verified_by)order by b.app_user_id),'[]'::jsonb))into result from public.group_artist_bindings b left join public.user_profiles up on up.app_user_id=b.app_user_id left join public.app_user_avatars av on av.app_user_id=b.app_user_id where b.page_id=g.id;
 when 'artist-bind' then
  if g.kind<>'fan' then raise exception 'GROUPS_INVALID_REQUEST';end if;
  if not exists(select 1 from public.app_users where id=(p_input->>'appUserId')::uuid and status='active')then raise exception 'GROUPS_NOT_FOUND';end if;
  insert into public.group_artist_bindings values(g.id,(p_input->>'appUserId')::uuid,p_admin_id)on conflict do nothing;
  if found then
   insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.artist.bind','group_page',g.id::text,req,jsonb_build_object('appUserId',p_input->>'appUserId','bound',true));
  end if;
  insert into public.group_memberships(page_id,app_user_id)values(g.id,(p_input->>'appUserId')::uuid)on conflict do nothing;result:=jsonb_build_object('updated',true);
 when 'artist-unbind' then
  delete from public.group_artist_bindings where page_id=g.id and app_user_id=(p_input->>'appUserId')::uuid;
  if found then
   insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.artist.unbind','group_page',g.id::text,req,jsonb_build_object('appUserId',p_input->>'appUserId','bound',false));
  end if;
  result:=jsonb_build_object('updated',true);
 when 'heartbeat' then
  if v_role is null and not exists(select 1 from public.group_artist_bindings where page_id=g.id and app_user_id=p_actor)then raise exception 'GROUPS_FORBIDDEN';end if;
  insert into public.group_presence values(g.id,p_actor,clock_timestamp())on conflict(page_id,app_user_id)do update set seen_at=excluded.seen_at;
  insert into public.group_visits values(g.id,p_actor,(now()at time zone 'Asia/Seoul')::date)on conflict do nothing;
  result:=jsonb_build_object('recorded',true);
 when 'presence' then
  select jsonb_build_object('onlineCount',(select count(*)from public.group_presence pr join public.app_users u on u.id=pr.app_user_id and u.status='active' where pr.page_id=g.id and pr.seen_at>now()-interval '90 seconds' and not exists(select 1 from public.group_artist_bindings where page_id=g.id and app_user_id=pr.app_user_id)),
   'todayCount',(select count(*)from public.group_visits v join public.app_users u on u.id=v.app_user_id and u.status='active' where v.page_id=g.id and v.day=(now()at time zone 'Asia/Seoul')::date and not exists(select 1 from public.group_artist_bindings where page_id=g.id and app_user_id=v.app_user_id)),
   'artists',coalesce((select jsonb_agg(jsonb_build_object('profileId',b.app_user_id,'nickname',coalesce(up.nickname,g.name),'online',coalesce(pr.seen_at>now()-interval '90 seconds',false),'visitedToday',exists(select 1 from public.group_visits where page_id=g.id and app_user_id=b.app_user_id and day=(now()at time zone 'Asia/Seoul')::date)))from public.group_artist_bindings b join public.group_artist_presence_settings s on s.app_user_id=b.app_user_id and s.enabled join public.app_users u on u.id=b.app_user_id and u.status='active' left join public.user_profiles up on up.app_user_id=b.app_user_id left join public.group_presence pr on pr.page_id=g.id and pr.app_user_id=b.app_user_id where b.page_id=g.id),'[]'::jsonb))into result;
 else raise exception 'GROUPS_INVALID_REQUEST';
 end case;
 if req is not null then insert into public.group_action_receipts(actor_id,request_id,operation,payload,response)values(p_actor,req,p_operation,payload,result);end if;
 return result;
end $$;

do $$declare t text;begin
 foreach t in array array['group_notification_settings','group_comments','group_post_reactions','group_post_views','group_reports','group_artist_bindings','group_artist_presence_settings','group_presence','group_visits','group_room_reads']loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function public.authorize_group_report_media_read(uuid,uuid,uuid,uuid,uuid,text,uuid),public.group_notification_page(text,uuid),public.authorize_mobile_media_read_before_groups(uuid,uuid,text),public.group_post_visible(uuid,uuid),public.authorize_group_media_read(uuid,uuid,text),public.group_post_view(uuid,uuid),public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
revoke all on function public.authorize_mobile_media_read(uuid,uuid,text)from public,anon,authenticated;
grant execute on function public.authorize_group_report_media_read(uuid,uuid,uuid,uuid,uuid,text,uuid),public.authorize_mobile_media_read(uuid,uuid,text),public.authorize_group_media_read(uuid,uuid,text),public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;

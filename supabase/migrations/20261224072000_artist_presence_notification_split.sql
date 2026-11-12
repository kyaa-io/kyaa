begin;
-- Display sharing does not grant notification consent.
alter table public.group_artist_presence_settings add column notify_enabled boolean not null default false;
CREATE OR REPLACE FUNCTION public.groups_content_dispatch_before_group_categories(p_operation text, p_actor uuid DEFAULT NULL::uuid, p_page_id uuid DEFAULT NULL::uuid, p_item_id uuid DEFAULT NULL::uuid, p_input jsonb DEFAULT '{}'::jsonb, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   insert into public.group_artist_presence_settings(app_user_id,enabled,notify_enabled) values(p_actor,coalesce((p_input->>'enabled')::boolean,true),coalesce((p_input->>'notifyEnabled')::boolean,false)) on conflict(app_user_id) do update set enabled=coalesce((p_input->>'enabled')::boolean,group_artist_presence_settings.enabled),notify_enabled=coalesce((p_input->>'notifyEnabled')::boolean,group_artist_presence_settings.notify_enabled);
  end if;
  return jsonb_build_object('notifyEnabled',coalesce((select notify_enabled from public.group_artist_presence_settings where app_user_id=p_actor),false),'enabled',coalesce((select enabled from public.group_artist_presence_settings where app_user_id=p_actor),false),'canConfigure',exists(select 1 from public.group_artist_bindings where app_user_id=p_actor));
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
  if exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier))<>'ok') then raise exception 'GROUPS_FORBIDDEN:%',(select public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)) from public.group_rooms r where r.id=p_item_id); end if;
  if not exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and r.status in('open','readonly')and(r.closes_at is null or r.closes_at>now())and public.group_room_allowed(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)))then raise exception 'GROUPS_NOT_FOUND';end if;
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
  if p_operation in('messages','message') and exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier))<>'ok') then raise exception 'GROUPS_FORBIDDEN:%',(select public.group_room_gate(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)) from public.group_rooms r where r.id=p_item_id); end if; if p_operation in('messages','message')and not exists(select 1 from public.group_rooms r where r.id=p_item_id and r.page_id=g.id and public.group_room_allowed(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier))and r.status in('open','readonly')and(p_operation='messages'or r.status='open'))then raise exception 'GROUPS_NOT_FOUND';end if;
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
   if not exists(select 1 from public.group_messages m join public.group_rooms r on r.id=m.room_id where m.id=(p_input->>'targetId')::uuid and m.removed_at is null and r.page_id=g.id and public.group_room_allowed(p_actor,g.id,coalesce(r.minimum_stage_key,r.minimum_tier)))then raise exception 'GROUPS_NOT_FOUND';end if;
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
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('appUserId',b.app_user_id,'nickname',up.nickname,'avatarUrl',public.public_fan_avatar_url(b.app_user_id),'verifiedBy',b.verified_by)order by b.app_user_id),'[]'::jsonb))into result from public.group_artist_bindings b left join public.user_profiles up on up.app_user_id=b.app_user_id left join public.app_user_avatars av on av.app_user_id=b.app_user_id where b.page_id=g.id;
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
end $function$

;
CREATE OR REPLACE FUNCTION public.artist_activity_notify_online(p_page uuid, p_artist uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare members integer;
begin
  if not public.artist_activity_inbox_enabled() then return 0; end if;
  if not exists (select 1 from public.group_pages where id = p_page and status = 'published') then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b
      join public.group_artist_presence_settings s on s.app_user_id = b.app_user_id and s.notify_enabled
      join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = p_page and b.app_user_id = p_artist) then return 0; end if;
  insert into public.artist_online_daily(artist_app_user_id, day, page_id) values (p_artist, (p_at at time zone 'Asia/Seoul')::date, p_page) on conflict do nothing;
  if not found then return 0; end if;
  select count(*) into members from (select 1 from public.group_memberships where page_id = p_page limit 501) x;
  if members > 500 then
    insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_online', p_page, p_page, p_artist, p_at);
    return 0;
  end if;
  return (public.artist_activity_online_batch(p_page, p_artist, p_at, null, null) ->> 'written')::integer;
end $function$

;
CREATE OR REPLACE FUNCTION public.artist_activity_online_batch(p_page uuid, p_artist uuid, p_at timestamp with time zone, p_after uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g record; artist_name text; kst_day date := (p_at at time zone 'Asia/Seoul')::date; added integer; seen integer; ids uuid[];
begin
 if not exists(select 1 from public.group_artist_presence_settings where app_user_id=p_artist and notify_enabled) then return jsonb_build_object('written',0,'last',p_after,'done',true); end if;
  if not public.artist_activity_inbox_enabled() then return jsonb_build_object('written', 0, 'last', p_after, 'done', false); end if;
  select id, name into g from public.group_pages where id = p_page and status = 'published';
  if not found then return jsonb_build_object('written', 0, 'last', null, 'done', true); end if;
  artist_name := public.artist_activity_display_name(p_artist, g.name);
  select coalesce(array_agg(r.app_user_id order by r.app_user_id), '{}') into ids
    from public.artist_activity_recipients(p_page, p_artist, 'artist_online', p_after, p_limit) r;
  seen := cardinality(ids);
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
  select r, 'artist_online', 'artist-online:' || p_artist::text || ':' || to_char(kst_day, 'YYYYMMDD'), p_at,
    jsonb_build_object('schemaVersion', 1, 'pageId', p_page, 'artistId', p_artist, 'artistName', artist_name, 'pageName', left(g.name, 60)),
    not public.artist_activity_push_allowed(r, 'artist_online', p_at)
  from unnest(ids) r
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  return jsonb_build_object('written', added, 'last', ids[seen], 'done', p_limit is null or seen < p_limit);
end $function$

;
commit;

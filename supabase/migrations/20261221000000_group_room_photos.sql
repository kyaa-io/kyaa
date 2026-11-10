begin;
set local lock_timeout='5s';
-- Room photos reuse private upload validation and cancellation; no public storage path.
alter table public.group_messages add column asset_id uuid unique references public.mobile_media_assets(id);
alter table public.group_messages drop constraint group_messages_body_check;
alter table public.group_messages add constraint group_messages_body_check check(length(btrim(body))<=2000 and (length(btrim(body))>0 or asset_id is not null));
do $$declare source text;needle text;replacement text;definition text;begin
 select pg_get_constraintdef(oid)into strict definition from pg_constraint where conrelid='public.mobile_media_assets'::regclass and conname='mobile_media_assets_attached_type_check';
 alter table public.mobile_media_assets drop constraint mobile_media_assets_attached_type_check;
 execute 'alter table public.mobile_media_assets add constraint mobile_media_assets_attached_type_check check(('||substring(definition from 8 for length(definition)-8)||') or attached_type=''group_message'')';
 source:=pg_get_functiondef('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 needle:=$old$insert into public.group_messages(room_id,author_id,body) values(r.id,p_actor,p_input->>'body') returning id into new_id;$old$;
 replacement:=$new$
   if p_input->>'assetId' is not null then
    perform 1 from public.mobile_media_assets where id=(p_input->>'assetId')::uuid and app_user_id=p_actor and purpose='group_post' and kind='image' and state='ready' and storage_deleted_at is null and cleanup_requested_at is null and attached_id is null and width>0 and height>0 for update;
    if not found then raise exception 'GROUPS_INVALID_REQUEST';end if;
   end if;
   insert into public.group_messages(room_id,author_id,body,asset_id) values(r.id,p_actor,p_input->>'body',(p_input->>'assetId')::uuid) returning id into new_id;
   update public.mobile_media_assets set attached_type='group_message',attached_id=new_id,access_scope='group_post',position=0 where id=(p_input->>'assetId')::uuid;
$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_INSERT_CHANGED';end if;
 execute replace(source,needle,replacement);
 source:=pg_get_functiondef('public.group_room_context(uuid,uuid,jsonb)'::regprocedure);
 needle:=$old$item||jsonb_build_object('avatarUrl',$old$;
 replacement:=$new$item||jsonb_build_object('asset',(select jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height) from public.group_messages m join public.mobile_media_assets a on a.id=m.asset_id where m.id=(item->>'id')::uuid and m.room_id=p_room and a.attached_type='group_message' and a.attached_id=m.id and a.state='ready' and a.storage_deleted_at is null and a.cleanup_requested_at is null),'avatarUrl',$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_CONTEXT_CHANGED';end if;
 execute replace(source,needle,replacement);
 source:=pg_get_functiondef('public.authorize_group_media_read(uuid,uuid,text)'::regprocedure);
 needle:=$old$select * into a from public.mobile_media_assets$old$;
 replacement:=$new$
 if exists(select 1 from public.mobile_media_assets where id=p_asset_id and attached_type='group_message') then
  if p_app_user_id is null then return null;end if;
  select media.* into a from public.mobile_media_assets media
  join public.group_messages m on m.asset_id=media.id and m.id=media.attached_id
  join public.group_rooms r on r.id=m.room_id join public.group_pages g on g.id=r.page_id
  where media.id=p_asset_id and media.purpose='group_post' and media.kind='image' and media.access_scope='group_post'
  and media.state='ready' and media.storage_deleted_at is null and media.cleanup_requested_at is null and m.removed_at is null
  and g.status='published' and r.status in('open','readonly') and (r.closes_at is null or r.closes_at>now())
  and public.group_room_allowed(p_app_user_id,r.page_id,coalesce(r.minimum_stage_key,r.minimum_tier))
  and not public.fan_web_blocked(p_app_user_id,m.author_id);
  if not found then return null;end if;
  return jsonb_build_object('storagePath',case when p_variant='thumbnail' then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail' then 'image/webp' else a.content_type end);
 end if;
 select * into a from public.mobile_media_assets$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_AUTH_CHANGED';end if;
 execute replace(source,needle,replacement);
end $$;
do $$declare source text;needle text;replacement text;begin
 source:=pg_get_functiondef('public.groups_content_dispatch_before_group_categories(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 needle:=$old$case result->>'targetType'when 'post'then'group_post'when'comment'then'group_comment'else''end$old$;
 replacement:=$new$case result->>'targetType'when 'post'then'group_post'when'comment'then'group_comment'when'message'then'group_message'else''end and (a.attached_type<>'group_message' or (a.kind='image' and a.cleanup_requested_at is null))$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_REPORT_CHANGED';end if;
 execute replace(source,needle,replacement);
 source:=pg_get_functiondef('public.authorize_group_report_media_read(uuid,uuid,uuid,uuid,uuid,text,uuid)'::regprocedure);
 needle:=$old$when'comment'then'group_comment'else''end$old$;
 replacement:=$new$when'comment'then'group_comment'when'message'then'group_message'else''end$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_REPORT_AUTH_CHANGED';end if;
 source:=replace(source,needle,replacement);
 needle:=$old$if not found then return null;end if;
 if gr.target_type='post'$old$;
 replacement:=$new$if not found then return null;end if;
 if gr.target_type='message' and (a.kind<>'image' or a.cleanup_requested_at is not null or not exists(select 1 from public.group_messages m join public.group_rooms r on r.id=m.room_id where m.id=gr.target_id and m.asset_id=a.id and m.removed_at is null and r.page_id=p_page_id))then return null;end if;
 if gr.target_type='post'$new$;
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'ROOM_PHOTO_REPORT_TARGET_CHANGED';end if;
 execute replace(source,needle,replacement);
end $$;
commit;

begin;
-- A native fan-board attachment policy is derived from the durable target, never UI flags.
create function public.fan_board_media_allowed(p_celebrity uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where g.kind='fan'and g.status='published'and c.id=p_celebrity and c.status='published'and c.archived_at is null and c.slug<>'kyaa-wave-fanpage')
$$;
create function public.read_fan_post_attachment_policy(p_app_user_id uuid,p_slug text)returns jsonb language plpgsql security definer set search_path=''as $$
declare creator uuid;allowed boolean;
begin
 select id into creator from public.celebrities where slug=p_slug and status='published'and archived_at is null;
 if creator is null then raise exception 'FAN_WEB_NOT_FOUND';end if;
 perform public.require_group_content_member(p_app_user_id,creator);
 perform public.fan_web_lock_active_user(p_app_user_id);
 allowed:=public.fan_board_media_allowed(creator);
 return jsonb_build_object('photoLimit',case when allowed then 10 else 4 end,'videoAllowed',allowed);
end $$;
revoke all on function public.fan_board_media_allowed(uuid),public.read_fan_post_attachment_policy(uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.read_fan_post_attachment_policy(uuid,text)to service_role;


-- This optional-viewer read is only for attached, visible native fan-board videos.
-- Drafts, Wave, DM and all other media keep their existing authenticated routes.
create function public.authorize_fan_post_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare a public.mobile_media_assets%rowtype;
begin
 if p_variant not in('original','thumbnail')then raise exception 'MEDIA_INVALID_INPUT';end if;
 if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id);end if;
 select media.*into a from public.mobile_media_assets media join public.fan_posts post on post.id=media.attached_id
 where media.id=p_asset_id and media.purpose='fan_post'and media.kind='video'and media.state='ready'and media.storage_deleted_at is null and media.cleanup_requested_at is null
 and media.attached_type='fan_post'and media.access_scope='fan_post'and public.fan_board_media_allowed(post.celebrity_id)
 and public.fan_web_content_visible(p_app_user_id,'fan_post',post.id);
 if not found then return null;end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);
end $$;
revoke all on function public.authorize_fan_post_media_read(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.authorize_fan_post_media_read(uuid,uuid,text)to service_role;

-- Exact existing functions are edited in place: preserve OID, current membership gates,
-- replay/revision semantics, cancellation and storage authorization wrappers.
do $$declare f record;next_body text;old text;next_def text;constraint_row record;patched integer:=0;begin
 select oid,prosrc into strict f from pg_proc where oid='public.save_fan_post(uuid,text,uuid,text,text,uuid[],integer,uuid)'::regprocedure;
 if position('public.require_group_content_member(p_app_user_id,'in f.prosrc)=0 or position('create_request_hash'in f.prosrc)=0 or position('MEDIA_INVALID_ASSET'in f.prosrc)=0 then raise exception 'FAN_BOARD_SAVE_CHAIN_CHANGED';end if;
 old:='cardinality(v_assets)>4';
 if (length(f.prosrc)-length(replace(f.prosrc,old,'')))/length(old)<>1 then raise exception 'FAN_BOARD_COUNT_GUARD_CHANGED';end if;
 next_body:=replace(f.prosrc,old,'cardinality(v_assets)>(case when public.fan_board_media_allowed((select id from public.celebrities where slug=p_slug))then 10 else 4 end)');
 old:='(purpose=''fan_post''and kind=''image'')';
 if (length(next_body)-length(replace(next_body,old,'')))/length(old)<>1 then raise exception 'FAN_BOARD_ASSET_GUARD_CHANGED';end if;
 next_body:=replace(next_body,old,'(purpose=''fan_post''and(kind=''image''or(kind=''video''and cardinality(v_assets)=1 and public.fan_board_media_allowed(v_creator))))');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,next_body);

 select oid,prosrc into strict f from pg_proc where oid='public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'::regprocedure;
 old:='p_purpose in(''fan_post'',''certification'',''support'',''group_image'')';
 if (length(f.prosrc)-length(replace(f.prosrc,old,'')))/length(old)<>1 then raise exception 'FAN_BOARD_RESERVATION_GUARD_CHANGED';end if;
 next_body:=replace(f.prosrc,old,'p_purpose in(''certification'',''support'',''group_image'')');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,next_body);

 -- Keep the unrelated official fan_post attachment path image-only and program publication Wave-only.
 if position('kind=''image'''in pg_get_functiondef('public.publish_owned_mobile_official_post(uuid,text,text,uuid[],uuid)'::regprocedure))=0 and position('kind = ''image'''in pg_get_functiondef('public.publish_owned_mobile_official_post(uuid,text,text,uuid[],uuid)'::regprocedure))=0 then raise exception 'FAN_BOARD_OFFICIAL_IMAGE_GUARD_CHANGED';end if;
 if position('p_slug=''kyaa-wave-fanpage'''in pg_get_functiondef('public.fan_program_notice(text,text)'::regprocedure))=0 then raise exception 'FAN_BOARD_PROGRAM_SCOPE_CHANGED';end if;

 -- Only remove fan_post from the existing image-only check; other image purposes stay restricted.
 for constraint_row in select oid,conname,pg_get_constraintdef(oid)definition from pg_constraint where conrelid='public.mobile_media_assets'::regclass and contype='c'loop
  if position('''fan_post''::text'in constraint_row.definition)>0 and position('''certification''::text'in constraint_row.definition)>0 and position('kind'in constraint_row.definition)>0 and position('''image''::text'in constraint_row.definition)>0 then
   next_def:=replace(constraint_row.definition,'''fan_post''::text, ','');
   if next_def=constraint_row.definition then raise exception 'FAN_BOARD_MEDIA_CHECK_CHANGED';end if;
   execute format('alter table public.mobile_media_assets drop constraint %I',constraint_row.conname);
   execute format('alter table public.mobile_media_assets add constraint %I %s',constraint_row.conname,next_def);patched:=patched+1;
  end if;
 end loop;
 if patched<>1 then raise exception 'FAN_BOARD_MEDIA_CHECK_COUNT_CHANGED';end if;
 patched:=0;
 for constraint_row in select conname,pg_get_constraintdef(oid)definition from pg_constraint where conrelid='public.content_assets'::regclass and contype='c'loop
  if position('position'in constraint_row.definition)>0 then
   next_def:=replace(constraint_row.definition,'"position" <= 3','"position" <= 9');
   if next_def=constraint_row.definition then raise exception 'FAN_BOARD_PHOTO_POSITION_CHANGED';end if;
   execute format('alter table public.content_assets drop constraint %I',constraint_row.conname);
   execute format('alter table public.content_assets add constraint %I %s',constraint_row.conname,next_def);patched:=patched+1;
  end if;
 end loop;
 if patched<>1 then raise exception 'FAN_BOARD_PHOTO_POSITION_COUNT_CHANGED';end if;
end $$;
commit;

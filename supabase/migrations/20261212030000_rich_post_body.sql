begin;
set local lock_timeout = '5s';
-- Rich text for board posts. `body` stays the plain text every older client, list, search, translation, report and point check reads.
-- `body_doc` is an additional, server-sanitized document (components/editor/rich-document.ts). Only the web route writes it.
--
-- Apply order: this migration first, then the web. Old web on this schema behaves as before: it never sends bodyDoc, the fan-post
-- read RPC keeps its shape, and a plain write clears the document through the trigger below.
-- Rollback of the web alone is safe: documents stay stored and unread, `body` keeps the text.

alter table public.fan_posts add column body_doc jsonb;
alter table public.group_posts add column body_doc jsonb;
alter table public.fan_posts add constraint fan_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=131072));
alter table public.group_posts add constraint group_posts_body_doc_shape check (body_doc is null or (jsonb_typeof(body_doc)='object' and body_doc->>'type'='doc' and octet_length(body_doc::text)<=131072));

-- A body changed by anything other than the rich write path (older client, account deletion, moderation scrub) must not leave an old document behind.
create function public.clear_stale_post_body_doc() returns trigger language plpgsql set search_path='' as $$
begin
 if new.body is distinct from old.body and new.body_doc is not distinct from old.body_doc then new.body_doc:=null; end if;
 return new;
end $$;
revoke all on function public.clear_stale_post_body_doc() from public,anon,authenticated,service_role;
create trigger clear_stale_body_doc before update of body on public.fan_posts for each row execute function public.clear_stale_post_body_doc();
create trigger clear_stale_body_doc before update of body on public.group_posts for each row execute function public.clear_stale_post_body_doc();

-- Fan board. save_fan_post keeps every existing check (membership, revision, idempotency, asset ownership and limits); a replay never rewrites the document.
create function public.save_fan_post_rich(p_app_user_id uuid,p_slug text,p_post_id uuid,p_body text,p_visibility text,p_asset_ids uuid[],p_expected_revision integer,p_idempotency_key uuid,p_body_doc jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare written jsonb;
begin
 if p_body_doc is null or jsonb_typeof(p_body_doc)<>'object' or p_body_doc->>'type'<>'doc' then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 written:=public.save_fan_post(p_app_user_id,p_slug,p_post_id,p_body,p_visibility,p_asset_ids,p_expected_revision,p_idempotency_key);
 if not coalesce((written->>'replayed')::boolean,false) then
  update public.fan_posts set body_doc=p_body_doc where id=(written->>'id')::uuid and app_user_id=p_app_user_id;
 end if;
 return written;
end $$;

-- Separate from read_fan_post so that clients with a strict post schema never receive an unknown field.
create function public.read_fan_post_body_doc(p_app_user_id uuid,p_post_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select p.body_doc from public.fan_posts p
 where p.id=p_post_id and p.body_doc is not null and public.fan_web_content_visible(p_app_user_id,'fan_post',p.id)
$$;

-- Group posts and operator notices. The dispatch keeps every existing check; the document follows the request that wrote the post.
alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_rich_body;
create function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;replay boolean:=false;doc jsonb;
begin
 if p_operation in('post','post-edit') and p_actor is not null and p_input->>'requestId' is not null then
  replay:=exists(select 1 from public.group_action_receipts r where r.actor_id=p_actor and r.request_id=(p_input->>'requestId')::uuid);
 end if;
 result:=public.groups_content_dispatch_before_rich_body(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation in('post','post-edit') and not replay and jsonb_typeof(result)='object' and result?'id' then
  update public.group_posts set body_doc=case when jsonb_typeof(p_input->'bodyDoc')='object' then p_input->'bodyDoc' end where id=(result->>'id')::uuid and author_id=p_actor;
 elsif p_operation='post-detail' and jsonb_typeof(result)='object' and result?'id' then
  -- post-detail has already applied group_post_visible for this actor.
  select p.body_doc into doc from public.group_posts p where p.id=(result->>'id')::uuid and p.page_id=p_page_id;
  if doc is not null then result:=result||jsonb_build_object('bodyDoc',doc); end if;
 end if;
 return result;
end $$;

revoke all on function public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb),
 public.read_fan_post_body_doc(uuid,uuid),
 public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),
 public.groups_content_dispatch_before_rich_body(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb),
 public.read_fan_post_body_doc(uuid,uuid),
 public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

-- Same cause as 20261209150000: the renamed function's ACL no longer names the owners of the security definer functions that call it.
do $$declare target regprocedure;owner_name name;target_owner name;begin
 foreach target in array array[
  'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.groups_content_dispatch_before_rich_body(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.save_fan_post(uuid,text,uuid,text,text,uuid[],integer,uuid)'::regprocedure,
  'public.fan_web_content_visible(uuid,text,uuid)'::regprocedure
 ] loop
  select pg_get_userbyid(proowner) into target_owner from pg_proc where oid=target;
  for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
   where p.pronamespace='public'::regnamespace and p.oid<>target and p.prosrc ~* ('\m'||(select proname from pg_proc where oid=target)||'\s*\(') loop
   if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner % for %',owner_name,target;end if;
   if owner_name<>target_owner then execute format('grant execute on function %s to %I',target,owner_name);end if;
  end loop;
 end loop;
end$$;
commit;

begin;
create function public.edit_fan_post_comment(p_app_user_id uuid, p_comment_id uuid, p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  update public.fan_post_comments set body=btrim(p_body), revision=revision+1, updated_at=clock_timestamp()
  where id=p_comment_id and app_user_id=p_app_user_id and deleted_at is null and hidden_at is null
    and public.fan_web_content_visible(p_app_user_id,'fan_post_comment',p_comment_id);
  if not found then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_app_user_id,'comment.edit','fan_post_comment',p_comment_id::text);
end $$;
revoke all on function public.edit_fan_post_comment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edit_fan_post_comment(uuid,uuid,text) to service_role;
alter table public.celebrity_notice_comments add column edited_at timestamptz;
create function public.edit_owned_notice_comment(p_app_user_id uuid, p_comment_id uuid, p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  update public.celebrity_notice_comments set body=btrim(p_body), edited_at=clock_timestamp()
  where id=p_comment_id and app_user_id=p_app_user_id and removed_at is null
    and public.fan_web_content_visible(p_app_user_id,'notice_comment',p_comment_id);
  if not found then raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_app_user_id,'comment.edit','notice_comment',p_comment_id::text);
end $$;
revoke all on function public.edit_owned_notice_comment(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edit_owned_notice_comment(uuid,uuid,text) to service_role;
alter table public.group_comments add column edited_at timestamptz;

create function public.group_member_comments(p_operation text,p_actor uuid,p_page_id uuid,p_item_id uuid,p_input jsonb,p_admin_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_operation='comments' then
    result:=public.groups_content_dispatch(p_operation,p_actor,p_page_id,p_item_id,p_input,null);
    return jsonb_set(result,'{items}',coalesce((select jsonb_agg(item || jsonb_build_object('isOwner',coalesce(c.author_id=p_actor,false),'editedAt',c.edited_at) order by ord)
      from jsonb_array_elements(result->'items') with ordinality entries(item,ord)
      join public.group_comments c on c.id=(item->>'id')::uuid),'[]'::jsonb));
  end if;
  perform public.fan_web_lock_active_user(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('groups-page:'||p_page_id::text,0));
  perform public.groups_dispatch('detail',p_actor,p_page_id);
  perform 1 from public.group_comments c join public.group_posts p on p.id=c.post_id
    where c.id=p_item_id and c.author_id=p_actor and c.removed_at is null
      and p.id=(p_input->>'postId')::uuid and p.page_id=p_page_id and public.group_post_visible(p_actor,p.id) for update of c;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  if p_operation='comment-remove' then
    result:=public.groups_content_dispatch(p_operation,p_actor,p_page_id,p_item_id,p_input,null);
    insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_actor,'comment.delete','group_comment',p_item_id::text);
    return result;
  elsif p_operation='comment-edit' then
    if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor) then raise exception 'GROUPS_FORBIDDEN'; end if;
    update public.group_comments set body=btrim(p_input->>'body'),edited_at=clock_timestamp() where id=p_item_id;
    insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_actor,'comment.edit','group_comment',p_item_id::text);
    return jsonb_build_object('edited',true);
  end if;
  raise exception 'GROUPS_INVALID_REQUEST';
end $$;
revoke all on function public.group_member_comments(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.group_member_comments(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

create function public.read_editable_notice_comments(p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 with page as materialized (select public.read_celebrity_notice_comments(p_slug,p_notice_slug,p_app_user_id,p_before,p_before_id,p_limit,p_locale) r)
 select jsonb_set(r,'{comments}',coalesce((select jsonb_agg(item || jsonb_build_object('editedAt',c.edited_at) order by ord)
 from jsonb_array_elements(r->'comments') with ordinality entries(item,ord)
 left join public.celebrity_notice_comments c on c.id=(item->>'id')::uuid),'[]'::jsonb)) from page
$$;
revoke all on function public.read_editable_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_editable_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale) to service_role;
create function public.delete_owned_fan_post_comment(p_app_user_id uuid,p_comment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare was_visible boolean;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select deleted_at is null and hidden_at is null into was_visible from public.fan_post_comments
    where id=p_comment_id and app_user_id=p_app_user_id for update;
  perform public.remove_fan_post_comment(p_app_user_id,p_comment_id);
  if was_visible then
    insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_app_user_id,'comment.delete','fan_post_comment',p_comment_id::text);
  end if;
end $$;
revoke all on function public.delete_owned_fan_post_comment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_owned_fan_post_comment(uuid,uuid) to service_role;
create function public.delete_owned_notice_comment(p_app_user_id uuid,p_comment_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare was_visible boolean;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select removed_at is null into was_visible from public.celebrity_notice_comments
    where id=p_comment_id and app_user_id=p_app_user_id for update;
  perform public.remove_owned_notice_comment(p_app_user_id,p_comment_id);
  if was_visible then
    insert into public.audit_logs(actor_app_user_id,action,entity_type,entity_id) values(p_app_user_id,'comment.delete','notice_comment',p_comment_id::text);
  end if;
end $$;
revoke all on function public.delete_owned_notice_comment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_owned_notice_comment(uuid,uuid) to service_role;
commit;

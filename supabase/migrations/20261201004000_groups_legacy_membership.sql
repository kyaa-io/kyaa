begin;
-- Joining a page is independent of passing fan verification. Do not change the
-- original helper: certification and reward eligibility still depend on it.
create function public.fan_web_is_page_member(p_app_user_id uuid,p_celebrity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.group_pages where celebrity_id=p_celebrity_id)
 then exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id join public.app_users u on u.id=m.app_user_id and u.status='active'
  where m.app_user_id=p_app_user_id and g.celebrity_id=p_celebrity_id and public.group_scope_visible(p_app_user_id,g.id))
 else public.fan_web_is_member(p_app_user_id,p_celebrity_id)end
$$;
create function public.require_group_content_member(p_actor uuid,p_celebrity uuid)
returns void language plpgsql security definer set search_path='' as $$
declare page uuid;
begin
 select id into page from public.group_pages where celebrity_id=p_celebrity;
 if page is not null then perform pg_advisory_xact_lock(hashtextextended('groups-page:'||page::text,0));end if;
 if not public.fan_web_is_page_member(p_actor,p_celebrity)then raise exception 'FAN_WEB_FORBIDDEN' using errcode='42501';end if;
end $$;

-- Patch only content entrypoints and their existing projection chain. Keeping
-- their current definitions retains Wave gates, moderation, media and replay.
do $$
declare f record;definition text;body text;next_body text;creator_expression text;changed integer:=0;
begin
 for f in select p.oid,p.proname,p.prosrc,p.proargnames,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and(p.proname like 'fan_web_content_target%' or p.proname='read_celebrity_fanpage_for_viewer'
 or p.proname in('save_fan_post','post_fan_post_comment','set_fan_post_like','post_celebrity_notice_comment','post_celebrity_notice_reply','set_notice_comment_reaction'))loop
  definition:=pg_get_functiondef(f.oid);body:=f.prosrc;
  next_body:=replace(body,'public.fan_web_is_member(','public.fan_web_is_page_member(');
  if f.proname in('save_fan_post','post_celebrity_notice_comment','post_celebrity_notice_reply')then
   if not('p_slug'=any(f.proargnames))then raise exception 'GROUPS_LEGACY_PARAMETER_CHANGED';end if;
   creator_expression:='(select id from public.celebrities where slug=p_slug)';
  elsif f.proname in('post_fan_post_comment','set_fan_post_like')then
   if not('p_post_id'=any(f.proargnames))then raise exception 'GROUPS_LEGACY_PARAMETER_CHANGED';end if;
   creator_expression:='(select celebrity_id from public.fan_posts where id=p_post_id)';
  elsif f.proname='set_notice_comment_reaction'then
   if not('p_comment_id'=any(f.proargnames))then raise exception 'GROUPS_LEGACY_PARAMETER_CHANGED';end if;
   creator_expression:='(select n.celebrity_id from public.celebrity_notice_comments c join public.celebrity_notices n on n.id=c.notice_id where c.id=p_comment_id)';
  else creator_expression:=null;end if;
  if creator_expression is not null then
   if not('p_app_user_id'=any(f.proargnames))then raise exception 'GROUPS_LEGACY_PARAMETER_CHANGED';end if;
   if f.lanname='plpgsql'then
    next_body:=regexp_replace(next_body,'\mBEGIN\M','BEGIN'||chr(10)||' PERFORM public.require_group_content_member(p_app_user_id,'||creator_expression||');','i');
   elsif f.lanname='sql'then
    definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
    next_body:='BEGIN PERFORM public.require_group_content_member(p_app_user_id,'||creator_expression||'); RETURN ('||rtrim(btrim(next_body),';')||'); END;';
   else raise exception 'GROUPS_LEGACY_LANGUAGE_CHANGED';end if;
  end if;
  if body<>next_body then execute replace(definition,body,next_body);changed:=changed+1;end if;
 end loop;
 if changed<3 then raise exception 'GROUPS_LEGACY_CONTENT_CHAIN_MISSING';end if;
end $$;
revoke all on function public.fan_web_is_page_member(uuid,uuid),public.require_group_content_member(uuid,uuid)from public,anon,authenticated,service_role;
commit;

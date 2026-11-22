begin;

-- A notice comment is written under the page's name only when its author chose that name and holds the page's own
-- official authority: an active channel operator of that creator, or an artist account bound to the creator's group page.
-- The kyaa-wide admin allowlist no longer makes a comment official on every page (11/22: operator comments showed as
-- 앙상블 패치워크, 창하, 엘리나). Existing rows keep their stored flag.
create function public.notice_official_author_allowed(p_app_user_id uuid,p_celebrity_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_app_user_id is not null and p_celebrity_id is not null
    and exists(select 1 from public.app_users u where u.id=p_app_user_id and u.status='active')
    and (exists(select 1 from public.channel_operators o
          where o.app_user_id=p_app_user_id and o.celebrity_id=p_celebrity_id and o.status='active')
      or exists(select 1 from public.group_artist_bindings b join public.group_pages gp on gp.id=b.page_id
          where gp.celebrity_id=p_celebrity_id and b.app_user_id=p_app_user_id))
$$;

-- The choice travels as a transaction-local setting naming the author; the authority is checked here, at insert.
create or replace function public.set_notice_comment_official_author()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_celebrity uuid;
begin
  new.is_official:=false;
  if coalesce(current_setting('kyaa.notice_comment_official',true),'')=new.app_user_id::text then
    select notice.celebrity_id into v_celebrity from public.celebrity_notices notice where notice.id=new.notice_id;
    if not public.notice_official_author_allowed(new.app_user_id,v_celebrity) then
      raise exception 'FANPAGE_FORBIDDEN' using errcode='42501';
    end if;
    new.is_official:=true;
  end if;
  return new;
end $$;

create function public.post_celebrity_notice_comment_as_official(
  p_app_user_id uuid,p_slug text,p_notice_slug text,p_body text,p_idempotency_key uuid,p_parent_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.notice_official_author_allowed(p_app_user_id,(select c.id from public.celebrities c where c.slug=p_slug)) then
    raise exception 'FANPAGE_FORBIDDEN' using errcode='42501';
  end if;
  perform pg_catalog.set_config('kyaa.notice_comment_official',p_app_user_id::text,true);
  if p_parent_id is null then
    v_result:=public.post_celebrity_notice_comment(p_app_user_id,p_slug,p_notice_slug,p_body,p_idempotency_key);
  else
    v_result:=public.post_celebrity_notice_reply(p_app_user_id,p_slug,p_notice_slug,p_body,p_idempotency_key,p_parent_id);
  end if;
  perform pg_catalog.set_config('kyaa.notice_comment_official','',true);
  -- A replayed key must have been an official write too.
  if not (select x.is_official from public.celebrity_notice_comments x where x.id=(v_result->>'id')::uuid) then
    raise exception 'FANPAGE_IDEMPOTENCY_CONFLICT' using errcode='23514';
  end if;
  return v_result;
end $$;

-- The names a viewer's comment can be posted under on this page: always the account's own name,
-- and the page's name only with the page's official authority.
create function public.read_notice_comment_author(p_app_user_id uuid,p_slug text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'name',coalesce((select nullif(btrim(profile.nickname),'') from public.user_profiles profile where profile.app_user_id=p_app_user_id),
      case when p_locale='ko' then '팬' else 'Fan' end),
    'official',case when public.notice_official_author_allowed(p_app_user_id,c.id)
      then jsonb_build_object('name',l.name,'avatarUrl',c.image_url) end)
  from public.celebrities c
  join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
  where c.slug=p_slug and c.status='published' and c.archived_at is null
    and exists(select 1 from public.app_users u where u.id=p_app_user_id and u.status='active')
$$;

-- The admin list shows the account that wrote a comment and, for an official one, the page name it went out under.
create or replace function public.read_admin_notice_comments(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_slug text,p_before timestamptz,p_before_id uuid,p_limit integer
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  if p_limit is null or p_limit not between 1 and 100 or ((p_before is null)<>(p_before_id is null)) then
    raise exception 'FANPAGE_INVALID_REQUEST';
  end if;
  select jsonb_build_object('comments',coalesce(jsonb_agg(row.body order by row.created_at desc,row.id desc),'[]'::jsonb))
  into v_result
  from (
    select cm.created_at,cm.id,jsonb_build_object(
      'id',cm.id,'body',cm.body,'nickname',coalesce(p.nickname,'팬'),'celebritySlug',c.slug,'noticeSlug',n.slug,
      'createdAt',cm.created_at,'officialName',case when cm.is_official then l.name end) body
    from public.celebrity_notice_comments cm
    join public.celebrity_notices n on n.id=cm.notice_id
    join public.celebrities c on c.id=n.celebrity_id
    left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale='ko'
    left join public.user_profiles p on p.app_user_id=cm.app_user_id
    where cm.removed_at is null
      and (p_slug is null or c.slug=p_slug)
      and (p_before is null or (cm.created_at,cm.id)<(p_before,p_before_id))
    order by cm.created_at desc,cm.id desc
    limit p_limit
  ) row;
  return v_result;
end $$;

revoke all on function public.notice_official_author_allowed(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid),
  public.read_notice_comment_author(uuid,text,public.content_locale) from public,anon,authenticated;
grant execute on function public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid),
  public.read_notice_comment_author(uuid,text,public.content_locale) to service_role;

-- A definer function runs as its owner (20261209150000): let each new caller's owner execute what it calls.
do $$declare pair record;callee_owner name;caller_owner name;begin
 for pair in select * from (values
   ('public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid)'::regprocedure,'public.post_celebrity_notice_comment(uuid,text,text,text,uuid)'::regprocedure),
   ('public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid)'::regprocedure,'public.post_celebrity_notice_reply(uuid,text,text,text,uuid,uuid)'::regprocedure),
   ('public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid)'::regprocedure,'public.notice_official_author_allowed(uuid,uuid)'::regprocedure),
   ('public.read_notice_comment_author(uuid,text,public.content_locale)'::regprocedure,'public.notice_official_author_allowed(uuid,uuid)'::regprocedure),
   ('public.set_notice_comment_official_author()'::regprocedure,'public.notice_official_author_allowed(uuid,uuid)'::regprocedure)
 ) v(caller,callee) loop
  select pg_get_userbyid(proowner) into caller_owner from pg_proc where oid=pair.caller;
  select pg_get_userbyid(proowner) into callee_owner from pg_proc where oid=pair.callee;
  if caller_owner in('anon','authenticated','service_role') then raise exception 'Unexpected definer owner % for %',caller_owner,pair.caller;end if;
  if caller_owner<>callee_owner then execute format('grant execute on function %s to %I',pair.callee,caller_owner);end if;
 end loop;
end$$;

commit;

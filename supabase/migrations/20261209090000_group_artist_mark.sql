begin;

-- Artist mark: linkage only (group_artist_bindings), independent of the presence setting.
-- Anonymous authors never get the mark so the mark cannot reveal who wrote the item.
create function public.group_artist_mark_items(p_page uuid,p_items jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item||jsonb_build_object('artist',
   coalesce(not coalesce((item->>'anonymous')::boolean,false),true)
   and k.pid is not null
   and exists(select 1 from public.group_artist_bindings b where b.page_id=p_page and b.app_user_id=k.pid)
  ) order by ord),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as entries(item,ord)
 cross join lateral (select case when item->>'profileId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (item->>'profileId')::uuid end as pid) k
$$;

alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_artist_mark;
create function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.groups_content_dispatch_before_artist_mark(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation in ('posts','comments') and jsonb_typeof(result->'items')='array' then
  result:=jsonb_set(result,'{items}',public.group_artist_mark_items(p_page_id,result->'items'));
 elsif p_operation='post-detail' and jsonb_typeof(result)='object' and result?'id' then
  result:=public.group_artist_mark_items(p_page_id,jsonb_build_array(result))->0;
 end if;
 return result;
end $$;

alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_artist_mark;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.groups_dispatch_before_artist_mark(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if p_operation='members' and jsonb_typeof(result->'items')='array' then
  result:=jsonb_set(result,'{items}',public.group_artist_mark_items(p_page_id,result->'items'));
 end if;
 return result;
end $$;

revoke all on function public.group_artist_mark_items(uuid,jsonb),public.groups_content_dispatch_before_artist_mark(text,uuid,uuid,uuid,jsonb,uuid),public.groups_dispatch_before_artist_mark(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

-- Fan pages (celebrity pages) do not pass through groups_content_dispatch. Their read RPCs are wrapped here.
-- The author is looked up from the item id; the artist is whoever is bound to the group page of the same celebrity.
-- The fan-page paths have no anonymous authors, and official notice comments keep their own official flag.
create function public.fan_artist_mark(p_items jsonb,p_source text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(e.item||jsonb_build_object('artist',coalesce(a.is_artist,false)) order by e.ord),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as e(item,ord)
 cross join lateral (select case when e.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.item->>'id')::uuid end as uid) k
 left join lateral (
  select exists(select 1 from public.group_artist_bindings b join public.group_pages gp on gp.id=b.page_id
    where gp.celebrity_id=s.celebrity_id and b.app_user_id=s.app_user_id) as is_artist
  from (
   select f.celebrity_id,f.app_user_id from public.fan_posts f where p_source='post' and f.id=k.uid
   union all select f.celebrity_id,c.app_user_id from public.fan_post_comments c join public.fan_posts f on f.id=c.post_id where p_source='comment' and c.id=k.uid
   union all select m.celebrity_id,m.app_user_id from public.fan_lounge_messages m where p_source='cheer' and m.id=k.uid
   union all select n.celebrity_id,c.app_user_id from public.celebrity_notice_comments c join public.celebrity_notices n on n.id=c.notice_id where p_source='notice' and not c.is_official and c.id=k.uid
  ) s limit 1
 ) a on true
$$;

alter function public.read_fan_post(uuid,uuid,public.content_locale) rename to read_fan_post_before_artist_mark;
create function public.read_fan_post(p_app_user_id uuid,p_post_id uuid,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'post')='object'
   then jsonb_set(r,'{post}',(public.fan_artist_mark(jsonb_build_array(r->'post'),'post'))->0) else r end
 from (with m as materialized (select public.read_fan_post_before_artist_mark(p_app_user_id,p_post_id,p_locale) r) select r from m) x
$$;

alter function public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale) rename to read_fan_posts_before_artist_mark;
create function public.read_fan_posts(p_app_user_id uuid,p_slug text,p_before timestamptz default null,p_before_id uuid default null,p_before_score bigint default null,p_sort text default 'latest',p_limit integer default 20,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'items')='array' then jsonb_set(r,'{items}',public.fan_artist_mark(r->'items','post')) else r end
 from (with m as materialized (select public.read_fan_posts_before_artist_mark(p_app_user_id,p_slug,p_before,p_before_id,p_before_score,p_sort,p_limit,p_locale) r) select r from m) x
$$;

alter function public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale) rename to read_fan_post_comments_before_artist_mark;
create function public.read_fan_post_comments(p_app_user_id uuid,p_post_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'items')='array' then jsonb_set(r,'{items}',public.fan_artist_mark(r->'items','comment')) else r end
 from (with m as materialized (select public.read_fan_post_comments_before_artist_mark(p_app_user_id,p_post_id,p_before,p_before_id,p_limit,p_locale) r) select r from m) x
$$;

alter function public.read_celebrity_cheers(text,uuid,timestamptz,uuid,integer,public.content_locale) rename to read_celebrity_cheers_before_artist_mark;
create function public.read_celebrity_cheers(p_slug text,p_app_user_id uuid default null,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 6,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'comments')='array' then jsonb_set(r,'{comments}',public.fan_artist_mark(r->'comments','cheer')) else r end
 from (with m as materialized (select public.read_celebrity_cheers_before_artist_mark(p_slug,p_app_user_id,p_before,p_before_id,p_limit,p_locale) r) select r from m) x
$$;

alter function public.read_celebrity_cheer_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale) rename to read_celebrity_cheer_replies_before_artist_mark;
create function public.read_celebrity_cheer_replies(p_parent_id uuid,p_app_user_id uuid default null,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'replies')='array' then jsonb_set(r,'{replies}',public.fan_artist_mark(r->'replies','cheer')) else r end
 from (with m as materialized (select public.read_celebrity_cheer_replies_before_artist_mark(p_parent_id,p_app_user_id,p_before,p_before_id,p_limit,p_locale) r) select r from m) x
$$;

-- The 6-argument notice-comment overload delegates to this 7-argument one.
alter function public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale) rename to read_celebrity_notice_comments_before_artist_mark;
create function public.read_celebrity_notice_comments(p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(r->'comments')='array' then jsonb_set(r,'{comments}',public.fan_artist_mark(r->'comments','notice')) else r end
 from (with m as materialized (select public.read_celebrity_notice_comments_before_artist_mark(p_slug,p_notice_slug,p_app_user_id,p_before,p_before_id,p_limit,p_locale) r) select r from m) x
$$;

revoke all on function public.fan_artist_mark(jsonb,text),
 public.read_fan_post_before_artist_mark(uuid,uuid,public.content_locale),
 public.read_fan_posts_before_artist_mark(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale),
 public.read_fan_post_comments_before_artist_mark(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheers_before_artist_mark(text,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheer_replies_before_artist_mark(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_notice_comments_before_artist_mark(text,text,uuid,timestamptz,uuid,integer,public.content_locale)
 from public,anon,authenticated,service_role;
revoke all on function public.read_fan_post(uuid,uuid,public.content_locale),
 public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale),
 public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheers(text,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheer_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)
 from public,anon,authenticated;
grant execute on function public.read_fan_post(uuid,uuid,public.content_locale),
 public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale),
 public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheers(text,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_cheer_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale),
 public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)
 to service_role;

commit;

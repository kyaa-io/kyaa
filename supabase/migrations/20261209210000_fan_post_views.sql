begin;
set local lock_timeout = '5s';
-- Apply order: ship the app first (postSchema accepts viewCount), then this migration. Unlike most migrations, applying the DB
-- first fails strict response validation in the old app. Roll back app code only to a version that already knows viewCount.
-- Fan-post view counts use the same basis as group posts (group_post_views): one row per signed-in viewer and post,
-- written when the post detail is read, counted as count(*). Signed-out reads are not counted.
create table public.fan_post_views(
  post_id uuid not null references public.fan_posts(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(post_id,app_user_id)
);
alter table public.fan_post_views enable row level security;
alter table public.fan_post_views force row level security;
revoke all on public.fan_post_views from public,anon,authenticated,service_role;

-- Every post JSON (list, feed, popular ranking, detail) now carries viewCount.
alter function public.fan_web_post_json(uuid,uuid,public.content_locale) rename to fan_web_post_json_before_views;
create function public.fan_web_post_json(p_app_user_id uuid,p_post_id uuid,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
 select case when base is null then null
  else base||jsonb_build_object('viewCount',(select count(*) from public.fan_post_views v where v.post_id=p_post_id)) end
 from (select public.fan_web_post_json_before_views(p_app_user_id,p_post_id,p_locale) base) x;
$$;
revoke all on function public.fan_web_post_json_before_views(uuid,uuid,public.content_locale),
 public.fan_web_post_json(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;

-- The detail read records the view, then returns the post with the updated count.
alter function public.read_fan_post(uuid,uuid,public.content_locale) rename to read_fan_post_before_views;
create function public.read_fan_post(p_app_user_id uuid,p_post_id uuid,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r:=public.read_fan_post_before_views(p_app_user_id,p_post_id,p_locale);
 if p_app_user_id is not null and jsonb_typeof(r->'post')='object' then
  insert into public.fan_post_views(post_id,app_user_id) values(p_post_id,p_app_user_id) on conflict do nothing;
  r:=jsonb_set(r,'{post,viewCount}',to_jsonb((select count(*) from public.fan_post_views v where v.post_id=p_post_id)));
 end if;
 return r;
end $$;
revoke all on function public.read_fan_post_before_views(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;
revoke all on function public.read_fan_post(uuid,uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_fan_post(uuid,uuid,public.content_locale) to service_role;

-- Same cause as 20261209150000: these functions are recreated or renamed here, so the ACL no longer names the owners of the
-- security definer functions that call them. Grant execute to each caller owner, never to an API role.
do $$declare target regprocedure;owner_name name;target_owner name;begin
 foreach target in array array[
  'public.fan_web_post_json(uuid,uuid,public.content_locale)'::regprocedure,
  'public.fan_web_post_json_before_views(uuid,uuid,public.content_locale)'::regprocedure,
  'public.read_fan_post_before_views(uuid,uuid,public.content_locale)'::regprocedure
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

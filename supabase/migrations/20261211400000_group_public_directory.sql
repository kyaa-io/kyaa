begin;
-- Signed-out reads for the fan list, the fan ranking tab and the secret room names. Read-only, and separate from read_group_people so the member API keeps its rule.
-- Left out of the fan list and ranking: disabled accounts, members under an active moderation restriction, people in a block with the viewer, members with profile_visible off, and everyone on an anonymous page.
-- These run as the function owner. On AWS that can be a role that is neither superuser nor BYPASSRLS, and such a role reads no row of a FORCE RLS table without a policy for it.
-- A filter written as not exists would then pass everyone silently, so group_public_directory_owner_access() gives that role read access and group_public_directory_owner_check() fails the migration on any gap.
-- The block and page checks are written out here rather than calling fan_web_blocked or group_scope_visible: those run as their own owner, and a block check whose owner cannot see user_blocks lifts the block.

-- Invoker on purpose: it reads as the owner of the definer that calls it. Must keep the same rule as group_scope_visible.
create function public.group_public_visible_page(p_actor uuid,p_page_id uuid)
returns public.group_pages language plpgsql stable set search_path='' as $$
declare g public.group_pages;
begin
 select p.*into g from public.group_pages p left join public.celebrities c on c.id=p.celebrity_id
  where p.id=p_page_id and p.status='published'
   and(p.celebrity_id is null or(c.status='published'and c.archived_at is null))
   and(c.slug is distinct from'kyaa-wave-fanpage'or exists(select 1 from public.kyaa_wave_participants w join public.app_users u on u.id=w.app_user_id and u.status='active' where w.app_user_id=p_actor and w.event_key='kyaa-wave-2026'));
 if not found then raise exception 'GROUPS_NOT_FOUND';end if;
 return g;
end $$;

create function public.read_group_public_people(p_actor uuid,p_page_id uuid,p_offset integer default 0,p_limit integer default 30,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.group_pages;result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 30 or p_offset is null or p_offset not between 0 and 270 or p_locale is null then raise exception 'GROUPS_INVALID_REQUEST';end if;
 g:=public.group_public_visible_page(p_actor,p_page_id);
 if g.anonymous then return jsonb_build_object('items','[]'::jsonb,'nextOffset',null);end if;
 with selected as materialized(
  select m.app_user_id,m.joined_at,row_number()over(order by m.joined_at,m.app_user_id)ord
  from public.group_memberships m
  join public.app_users a on a.id=m.app_user_id and a.status='active'
  join public.social_profile_settings s on s.app_user_id=m.app_user_id and s.profile_visible
  where m.page_id=g.id
   and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=m.app_user_id and r.revoked_at is null)
   and(p_actor is null or not exists(select 1 from public.user_blocks b where(b.app_user_id=p_actor and b.blocked_app_user_id=m.app_user_id)or(b.app_user_id=m.app_user_id and b.blocked_app_user_id=p_actor)))
  order by m.joined_at,m.app_user_id offset p_offset limit p_limit+1
 ),shown as materialized(select *from selected order by ord limit p_limit)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'nickname',coalesce(nullif(btrim(u.nickname),''),case when p_locale='ko'then'팬'else'Fan'end),
    'avatarUrl',public.public_fan_avatar_url(x.app_user_id),
    'tier',case when g.kind='fan'then public.get_fan_effective_tier(x.app_user_id,g.celebrity_id)end
   )order by x.ord)from shown x left join public.user_profiles u on u.app_user_id=x.app_user_id),'[]'::jsonb),
  'nextOffset',case when(select count(*)from selected)>p_limit and p_offset+p_limit<=270 then p_offset+p_limit end
 )into result;
 return result;
end $$;

-- The published top 100 for the page, with the same people left out. Ranks stay as computed, so gaps are expected.
create function public.read_group_public_ranking(p_actor uuid,p_page_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.group_pages;raw jsonb;
begin
 g:=public.group_public_visible_page(p_actor,p_page_id);
 if g.celebrity_id is null then return jsonb_build_object('computedAt',null,'rows','[]'::jsonb);end if;
 raw:=public.read_page_ranking(g.celebrity_id,'fan_contribution','all',null);
 if g.anonymous then return jsonb_build_object('computedAt',raw->'computedAt','rows','[]'::jsonb);end if;
 return jsonb_build_object('computedAt',raw->'computedAt','rows',coalesce((
  select jsonb_agg(jsonb_build_object('rank',(e.value->>'rank')::integer,'score',(e.value->>'score')::bigint,'nickname',e.value->>'nickname','characterId',e.value->>'characterId')order by(e.value->>'rank')::integer)
  from jsonb_array_elements(raw->'rows')e
  join public.app_users a on a.id=(e.value->>'subjectId')::uuid and a.status='active'
  join public.social_profile_settings s on s.app_user_id=a.id and s.profile_visible
  where not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=a.id and r.revoked_at is null)
   and(p_actor is null or not exists(select 1 from public.user_blocks b where(b.app_user_id=p_actor and b.blocked_app_user_id=a.id)or(b.app_user_id=a.id and b.blocked_app_user_id=p_actor)))
 ),'[]'::jsonb));
end $$;

-- Fan pages create their three default rooms on the first member read. A signed-out read must not write, so it lists the missing ones instead.
create function public.read_group_public_rooms(p_actor uuid,p_page_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.group_pages;result jsonb;
begin
 g:=public.group_public_visible_page(p_actor,p_page_id);
 with defaults(key,name,tier,ord)as(values('artist','아티스트 소통방','Bronze',1),('certified','인증팬 소통방','Bronze',2),('free','자유 소통방',null,3)),
 rooms as materialized(
  select r.name,r.minimum_tier,r.created_at,coalesce((select d.ord from defaults d where d.key=r.default_key),0)ord
  from public.group_rooms r
  where r.page_id=g.id and r.status<>'closed'and(r.closes_at is null or r.closes_at>now())
  union all
  select d.name,d.tier,null,d.ord from defaults d
  where g.kind='fan'and not exists(select 1 from public.group_rooms r where r.page_id=g.id and r.default_key=d.key)
 ),ranked as(select *from rooms order by ord,created_at desc nulls last,name limit 50)
 select jsonb_build_object('roomCount',(select count(*)from rooms),'items',coalesce((select jsonb_agg(jsonb_build_object('name',name,'minimumTier',minimum_tier))from ranked),'[]'::jsonb))into result;
 return result;
end $$;

-- Which definers need what. Kept in one place so access and check cannot drift apart.
create function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking')
$$;
create function public.group_public_directory_owner_tables()returns text[] language sql immutable set search_path='' as $$
 select array['group_pages','celebrities','app_users','kyaa_wave_participants','group_memberships','social_profile_settings','app_user_moderation_restrictions','user_blocks','user_profiles','group_rooms']::text[]
$$;
create function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)']::text[]
$$;

-- Fails with PUBLIC_DIRECTORY_OWNER_GAP when a definer owner could not read a table or call a function it relies on.
create function public.group_public_directory_owner_check()returns void language plpgsql stable set search_path='' as $$
declare r record;t text;f text;c pg_catalog.pg_class;gaps text[]:='{}';
begin
 for r in select *from public.group_public_directory_owner_roles() loop
  continue when r.rolsuper;
  if r.rolname in('anon','authenticated','service_role','public')then gaps:=gaps||format('%s may not own these functions',r.rolname);continue;end if;
  foreach t in array public.group_public_directory_owner_tables() loop
   select *into c from pg_catalog.pg_class where oid=('public.'||t)::regclass;
   if not pg_catalog.has_table_privilege(r.role_oid,c.oid,'select')then gaps:=gaps||format('%s lacks select on %s',r.rolname,t);end if;
   if not r.rolbypassrls and c.relrowsecurity and(c.relforcerowsecurity or c.relowner<>r.role_oid)
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and r.role_oid=any(p.polroles)and p.polpermissive and p.polcmd in('r','*'))then
    gaps:=gaps||format('%s has no read policy on %s',r.rolname,t);
   end if;
  end loop;
  foreach f in array public.group_public_directory_owner_functions() loop
   if not pg_catalog.has_function_privilege(r.role_oid,f,'execute')then gaps:=gaps||format('%s cannot execute %s',r.rolname,f);end if;
  end loop;
 end loop;
 if cardinality(gaps)>0 then raise exception 'PUBLIC_DIRECTORY_OWNER_GAP: %',array_to_string(gaps,'; ');end if;
end $$;

-- Gives each ordinary owner what the check asks for. Never touches client roles. Run it again if the functions change owner later.
create function public.group_public_directory_owner_access()returns void language plpgsql set search_path='' as $$
declare r record;t text;f text;c pg_catalog.pg_class;
begin
 for r in select *from public.group_public_directory_owner_roles() where not rolsuper and rolname not in('anon','authenticated','service_role','public') loop
  foreach t in array public.group_public_directory_owner_tables() loop
   select *into c from pg_catalog.pg_class where oid=('public.'||t)::regclass;
   if c.relowner<>r.role_oid then
    begin execute format('grant select on table public.%I to %I',t,r.rolname);exception when insufficient_privilege then null;end;
   end if;
   if not r.rolbypassrls and c.relrowsecurity and(c.relforcerowsecurity or c.relowner<>r.role_oid)
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and r.role_oid=any(p.polroles)and p.polpermissive and p.polcmd in('r','*'))then
    begin execute format('create policy %I on public.%I for select to %I using(true)','public_directory_owner_'||r.rolname,t,r.rolname);exception when insufficient_privilege then null;end;
   end if;
  end loop;
  foreach f in array public.group_public_directory_owner_functions() loop
   begin execute format('grant execute on function %s to %I',f,r.rolname);exception when insufficient_privilege then null;end;
  end loop;
 end loop;
end $$;

revoke all on function public.group_public_visible_page(uuid,uuid),public.group_public_directory_owner_roles(),public.group_public_directory_owner_tables(),public.group_public_directory_owner_functions(),public.group_public_directory_owner_check(),public.group_public_directory_owner_access()from public,anon,authenticated,service_role;
revoke all on function public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale),public.read_group_public_rooms(uuid,uuid),public.read_group_public_ranking(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale),public.read_group_public_rooms(uuid,uuid),public.read_group_public_ranking(uuid,uuid)to service_role;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

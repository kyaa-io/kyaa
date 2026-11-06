begin;
-- 2026-11-06 user decision: there is no public or private profile any more. Every profile is public.
-- social_profile_settings.profile_visible stays stored and is no longer read or written, so existing choices survive and this can be reversed.
-- Every condition that read the column now calls social_profile_is_public(). To reverse the decision, restore that one body to read the column and restore set_owned_social_settings.
-- Kept: blocks, disabled accounts, moderation restrictions (in this function), anonymous pages, hidden pages. Favorite visibility is a separate setting and is unchanged.
create function public.social_profile_is_public(p_app_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=p_app_user_id and r.revoked_at is null)
$$;
revoke all on function public.social_profile_is_public(uuid)from public,anon,authenticated,service_role;

do $patch$
declare f record;def text;patched text;owner_name name;
begin
 for f in select p.oid,p.oid::regprocedure::text sig,p.prosecdef,o.rolname,o.rolsuper from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner
  where p.pronamespace='public'::regnamespace and p.prosrc like '%profile_visible%' loop
  def:=pg_catalog.pg_get_functiondef(f.oid);
  if f.sig like 'set_owned_social_settings(%' then
   patched:=replace(def,'insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy) values(p_app_user_id,p_profile_visible,p_dm_policy) on conflict(app_user_id) do update set profile_visible=excluded.profile_visible,dm_policy=excluded.dm_policy','insert into public.social_profile_settings(app_user_id,dm_policy) values(p_app_user_id,p_dm_policy) on conflict(app_user_id) do update set dm_policy=excluded.dm_policy');
  else
   patched:=regexp_replace(def,'coalesce\(\(select profile_visible from public\.social_profile_settings where app_user_id=([a-z_]+)\),false\)','public.social_profile_is_public(\1)','g');
   patched:=regexp_replace(patched,'join public\.social_profile_settings (\w+) on \1\.app_user_id=([a-z_.]+) and \1\.profile_visible','join lateral(select public.social_profile_is_public(\2) ok)\1 on \1.ok','g');
   patched:=regexp_replace(patched,'exists\(select 1 from public\.social_profile_settings s where s\.app_user_id=([a-z_.]+) and s\.profile_visible\)','public.social_profile_is_public(\1)','g');
  end if;
  if patched=def then raise exception 'PROFILE_ALL_PUBLIC_UNPATCHED: %',f.sig;end if;
  execute patched;
  if not f.rolsuper then execute format('grant execute on function public.social_profile_is_public(uuid) to %I',f.rolname);end if;
  if not f.prosecdef then execute 'grant execute on function public.social_profile_is_public(uuid) to service_role';end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ '(^|[^_])profile_visible|\.profile_visible') then
  raise exception 'PROFILE_ALL_PUBLIC_UNPATCHED: %',(select array_agg(p.oid::regprocedure::text) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ '(^|[^_])profile_visible|\.profile_visible');
 end if;
 for owner_name in select distinct o.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner where p.pronamespace='public'::regnamespace and p.prosrc like '%social_profile_is_public%' and p.proname<>'social_profile_is_public' and not o.rolsuper and not pg_catalog.has_function_privilege(o.oid,'public.social_profile_is_public(uuid)','execute') loop
  raise exception 'PUBLIC_DIRECTORY_OWNER_GAP: % cannot execute social_profile_is_public',owner_name;
 end loop;
end $patch$;

-- The function itself reads a FORCE RLS table, so its owner goes through the same access and check.
create or replace function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking','social_profile_is_public')
$$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)']::text[]
$$;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

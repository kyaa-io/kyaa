-- Fan page names follow the requested language: requested locale -> en -> ko localization -> stored name -> slug.
-- Only fan pages linked to a creator use celebrity_localizations. Hobby, brand and user-authored names stay verbatim.
-- No columns, no data writes. Without a locale (p_locale null and no app.group_locale) the stored name is returned
-- exactly as before. Only directory/resolve/detail calls that carry a locale are translated; the web client sends no
-- locale for the management screen's detail request, so settings forms and saves keep the stored name. Callers that
-- save a name must read it without a locale.
--
-- Revert (definitions before this migration). Run all four steps in ONE transaction: between steps 2 and 4
-- service_role has no execute right on groups_dispatch.
--   1. drop the patched search filter by re-running the old filter text:
--      replace '(gp.name ilike X or public.group_page_name(gp.id,null) ilike X)' with 'gp.name ilike X' in every
--      public.groups_dispatch* layer that carries it (the same do-block shape as 20261209050000, reversed);
--   2. alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_name_locale_dropped;
--      alter function public.groups_dispatch_before_name_locale(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch;
--      drop function public.groups_dispatch_name_locale_dropped(text,uuid,uuid,uuid,jsonb,uuid);
--   3. drop function public.group_page_json(uuid,text); drop function public.group_page_name(uuid,text);
--      recreate public.group_page_json(uuid) exactly as in 20261201000000_groups_core.sql line 60;
--      revoke all on it from public,anon,authenticated,service_role;
--   4. re-apply grants: revoke on the renamed layer, grant execute on groups_dispatch to service_role only.
begin;

create function public.group_page_name(p_id uuid,p_locale text default null) returns text language sql stable security definer set search_path='' as $$
 with want as (
  select case when coalesce(p_locale,nullif(current_setting('app.group_locale',true),'')) is null then null
              when coalesce(p_locale,nullif(current_setting('app.group_locale',true),''))='ko' then 'ko' else 'en' end as loc
 )
 select case when w.loc is null or g.kind<>'fan' or g.celebrity_id is null then g.name
  else coalesce(
   (select nullif(btrim(l.name),'') from public.celebrity_localizations l where l.celebrity_id=g.celebrity_id and l.locale::text=w.loc),
   (select nullif(btrim(l.name),'') from public.celebrity_localizations l where l.celebrity_id=g.celebrity_id and l.locale::text='en'),
   (select nullif(btrim(l.name),'') from public.celebrity_localizations l where l.celebrity_id=g.celebrity_id and l.locale::text='ko'),
   nullif(btrim(g.name),''),
   (select c.slug from public.celebrities c where c.id=g.celebrity_id)) end
 from public.group_pages g cross join want w where g.id=p_id
$$;

drop function public.group_page_json(uuid);
create function public.group_page_json(p_id uuid,p_locale text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',public.group_page_name(g.id,p_locale),'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id))
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;
revoke all on function public.group_page_name(uuid,text),public.group_page_json(uuid,text) from public,anon,authenticated,service_role;

-- Search matches the stored name or the name shown for the requested language.
do $$declare fn record;definition text;patched integer:=0;
 old_filter constant text:='gp.name ilike ''%''||(p_input->>''search'')||''%''';
 new_filter constant text:='(gp.name ilike ''%''||(p_input->>''search'')||''%'' or public.group_page_name(gp.id,null) ilike ''%''||(p_input->>''search'')||''%'')';
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'groups\_dispatch%' and position(old_filter in p.prosrc)>0 and position(new_filter in p.prosrc)=0 loop
  definition:=pg_get_functiondef(fn.oid);
  execute replace(definition,old_filter,new_filter);
  patched:=patched+1;
 end loop;
 if patched<1 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'groups\_dispatch%' and position(old_filter in p.prosrc)>0 and position(new_filter in p.prosrc)=0) then raise exception 'GROUP_DIRECTORY_SEARCH_SHAPE';end if;
end $$;

-- The requested language is carried for the read operations only, transaction-local, and cleared before returning.
alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_name_locale;
create function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if p_operation not in ('directory','resolve','detail') or coalesce(p_input->>'locale','') !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$' then
  return public.groups_dispatch_before_name_locale(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 perform set_config('app.group_locale',case when lower(p_input->>'locale')='ko' then 'ko' else 'en' end,true);
 v_result:=public.groups_dispatch_before_name_locale(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 perform set_config('app.group_locale','',true);
 return v_result;
end $$;
revoke all on function public.groups_dispatch_before_name_locale(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

commit;

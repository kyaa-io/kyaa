-- Existing banners keep their Home placement. Metadata updates share the existing revision lock and audit.
begin;
alter table public.home_banners
 add column placement text not null default 'home' check (placement in ('home','groups','both')),
 add column category text not null default 'announcement' check (category in ('event','group','fanpage','announcement','live'));
update public.home_banners set category='live' where kind='regular_live';
create or replace function public.read_published_home_banners(p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id)
  ) order by b.sort_order,b.id),'[]'::jsonb)
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement in ('home','both') and b.publication_status='published'
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null;
$$;

create or replace function public.read_published_discovery_banners(p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id)
  ) order by b.sort_order,b.id),'[]'::jsonb)
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement in ('groups','both') and b.publication_status='published'
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null;
$$;

create or replace function public.get_admin_home_banner_manager(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
      'publicationStatus',b.publication_status,'sortOrder',b.sort_order,'revision',b.revision,
      'localizations',jsonb_build_object(
        'ko',jsonb_build_object('title',ko.title,'description',ko.description,'ctaLabel',ko.cta_label,'href',ko.href,'alt',ko.alt,'desktopImage',public.home_banner_asset_json(ko.desktop_asset_id),'mobileImage',public.home_banner_asset_json(ko.mobile_asset_id)),
        'en',jsonb_build_object('title',en.title,'description',en.description,'ctaLabel',en.cta_label,'href',en.href,'alt',en.alt,'desktopImage',public.home_banner_asset_json(en.desktop_asset_id),'mobileImage',public.home_banner_asset_json(en.mobile_asset_id))
      )) order by b.sort_order,b.id) from public.home_banners b
      join public.home_banner_localizations ko on ko.banner_id=b.id and ko.locale='ko'
      join public.home_banner_localizations en on en.banner_id=b.id and en.locale='en'),'[]'::jsonb),
    'celebrities',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'nameKo',ko.name,'nameEn',en.name) order by c.display_order,c.id)
      from public.celebrities c join public.celebrity_localizations ko on ko.celebrity_id=c.id and ko.locale='ko'
      join public.celebrity_localizations en on en.celebrity_id=c.id and en.locale='en'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.save_admin_managed_banner(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,
  p_banner_id uuid,p_expected_revision integer,p_kind public.home_banner_kind,p_celebrity_id uuid,
  p_localizations jsonb,p_placement text default null,p_category text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.home_banners; loc public.content_locale; payload jsonb; v_before jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-banners',20260913));
  if p_localizations is null or jsonb_typeof(p_localizations)<>'object' or not (p_localizations ?& array['ko','en']) then raise exception 'invalid banner localizations'; end if;
  if p_kind='regular_live' and p_celebrity_id is null then raise exception 'celebrity required'; end if;
  if p_banner_id is null then
    if p_expected_revision is distinct from 0 then raise exception 'revision conflict'; end if;
    insert into public.home_banners(kind,celebrity_id,placement,category,sort_order) values(p_kind,p_celebrity_id,coalesce(p_placement,'home'),coalesce(p_category,case when p_kind='regular_live' then 'live' else 'announcement' end),coalesce((select max(sort_order)+1 from public.home_banners),0)) returning * into b;
  else
    select * into b from public.home_banners x where x.id=p_banner_id for update;
    if not found then raise exception 'banner not found'; end if;
    v_before:=to_jsonb(b);
    if b.revision is distinct from p_expected_revision then raise exception 'revision conflict'; end if;
    update public.home_banners set kind=p_kind,celebrity_id=p_celebrity_id,placement=coalesce(p_placement,b.placement),category=coalesce(p_category,b.category),revision=revision+1 where id=p_banner_id returning * into b;
  end if;
  foreach loc in array array['ko','en']::public.content_locale[] loop
    payload:=p_localizations->(loc::text);
    insert into public.home_banner_localizations(banner_id,locale,title,description,cta_label,href,alt,desktop_asset_id,mobile_asset_id)
    values(b.id,loc,coalesce(payload->>'title',''),coalesce(payload->>'description',''),coalesce(payload->>'ctaLabel',''),coalesce(payload->>'href',''),coalesce(payload->>'alt',''),nullif(payload->>'desktopAssetId','')::uuid,nullif(payload->>'mobileAssetId','')::uuid)
    on conflict(banner_id,locale) do update set title=excluded.title,description=excluded.description,cta_label=excluded.cta_label,href=excluded.href,alt=excluded.alt,desktop_asset_id=excluded.desktop_asset_id,mobile_asset_id=excluded.mobile_asset_id;
  end loop;
  if b.publication_status='published' and exists(
    select 1 from public.home_banner_localizations l where l.banner_id=b.id
      and (length(btrim(l.title))=0 or length(btrim(l.cta_label))=0 or length(btrim(l.alt))=0 or l.href='' or l.desktop_asset_id is null)
  ) then raise exception 'banner publication incomplete'; end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
  values(p_actor_app_user_id,p_actor_admin_allowlist_id,'home_banner.saved','home_banner',b.id::text,jsonb_build_object('before',v_before,'after',to_jsonb(b)),p_correlation_id);
  return jsonb_build_object('id',b.id,'revision',b.revision);
end $$;

create or replace function public.save_admin_home_banner(
 p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,
 p_banner_id uuid,p_expected_revision integer,p_kind public.home_banner_kind,p_celebrity_id uuid,p_localizations jsonb
) returns jsonb language sql security definer set search_path='' as $$
 select public.save_admin_managed_banner(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_banner_id,p_expected_revision,p_kind,p_celebrity_id,p_localizations);
$$;
revoke all on function public.read_published_discovery_banners(public.content_locale),public.save_admin_managed_banner(uuid,uuid,uuid,uuid,integer,public.home_banner_kind,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.read_published_discovery_banners(public.content_locale),public.save_admin_managed_banner(uuid,uuid,uuid,uuid,integer,public.home_banner_kind,uuid,jsonb,text,text) to service_role;
notify pgrst, 'reload schema';
commit;

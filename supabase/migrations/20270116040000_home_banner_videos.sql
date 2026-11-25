-- Managed banners can carry a muted loop over the same scene: an extensionless MP4/WebM pair (SceneVideo) per locale,
-- one for the wide image and one for the square image. The images stay as the poster and the fallback.
begin;
set local lock_timeout='5s';
alter table public.home_banner_localizations
  add column desktop_video text,
  add column mobile_video text,
  add constraint home_banner_video_path check (
    (desktop_video is null or desktop_video ~ '^/public-assets/cms-assets/home-banners/video/[a-z0-9][a-z0-9-]{0,118}$')
    and (mobile_video is null or (desktop_video is not null and mobile_video ~ '^/public-assets/cms-assets/home-banners/video/[a-z0-9][a-z0-9-]{0,118}$'))
  );

-- The loops are uploaded from the banner manager as an MP4 and a WebM file. On the AWS databases the bucket row is sealed
-- (see 20261221170000), so the S3 reservation allows WebM for the banner loop folder alone; elsewhere the bucket row allows it.
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'storage.buckets'::regclass and not t.tgisinternal and t.tgfoid = to_regproc('storage.byus_reject_metadata_mutation')) then return; end if;
  update storage.buckets set allowed_mime_types=array_append(allowed_mime_types,'video/webm')
   where id='cms-assets' and allowed_mime_types is not null and not ('video/webm'=any(allowed_mime_types));
end $$;
do $$
declare f record; old text := '(b.allowed_mime_types is not null and not p_content_type=any(b.allowed_mime_types))'; next_body text;
  new_text text := '(b.allowed_mime_types is not null and not p_content_type=any(b.allowed_mime_types) and not (p_bucket=''cms-assets'' and p_content_type=''video/webm'' and p_path like ''home-banners/video/%''))';
begin
  if to_regprocedure('public.reserve_s3_storage_object(text,text,text,bigint,text)') is null then return; end if;
  select oid, prosrc into strict f from pg_proc where oid = 'public.reserve_s3_storage_object(text,text,text,bigint,text)'::regprocedure;
  if position(new_text in f.prosrc) > 0 then return; end if;
  if (length(f.prosrc) - length(replace(f.prosrc, old, ''))) / length(old) <> 1 then raise exception 'BANNER_VIDEO_S3_TYPE_GUARD_CHANGED'; end if;
  next_body := replace(f.prosrc, old, new_text);
  execute replace(pg_get_functiondef(f.oid), f.prosrc, next_body);
end $$;

create or replace function public.read_published_home_banners(p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id)
  ) || case when l.desktop_video is null then '{}'::jsonb else jsonb_build_object('video',jsonb_build_object('desktop',l.desktop_video,'mobile',l.mobile_video)) end
  order by b.sort_order,b.id),'[]'::jsonb)
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
  ) || case when l.desktop_video is null then '{}'::jsonb else jsonb_build_object('video',jsonb_build_object('desktop',l.desktop_video,'mobile',l.mobile_video)) end
  order by b.sort_order,b.id),'[]'::jsonb)
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement in ('groups','both') and b.publication_status='published'
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null;
$$;

create or replace function public.read_published_slot_banners(p_locale public.content_locale,p_area text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_locale is null or p_area is null or p_area not in('home','fanpage','dukjil','member-event','chemi-promo')then raise exception 'invalid banner area' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(x.placement,x.banner) from(
  select distinct on(b.placement) b.placement,jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id),'desktopVideo',l.desktop_video,'mobileVideo',l.mobile_video)
    || case when p_area in ('member-event','chemi-promo') then jsonb_build_object('startsAt',b.popup_starts_at,'endsAt',b.popup_ends_at) else '{}'::jsonb end banner
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement=any(case p_area when 'chemi-promo' then array['chemi_promo_popup'] when 'member-event' then array['member_event_popup'] when 'home' then array['home_below_board','home_between_events','home_mid'] when 'fanpage' then array['fanpage_below_gallery','fanpage_second'] else array['dukjil_mid','dukjil_side','dukjil_side_2','dukjil_side_3'] end) and b.publication_status='published'
    and (p_area <> 'member-event' or (
      now() >= b.popup_starts_at and now() < b.popup_ends_at and (
        exists(select 1 from public.live_events e
          join public.celebrities c on c.id=e.celebrity_id
          where l.href='/live/'||e.slug and e.publication_status='published'
            and public.live_effective_status_at(e.id,now()) in ('scheduled','live') and c.status='published' and c.archived_at is null
            and now() >= e.reservation_opens_at and now() < e.ends_at)
        or exists(select 1 from public.group_raffles r
          join public.group_pages g on g.id=r.page_id
          left join public.celebrities c on c.id=g.celebrity_id
          where l.href='/pages/groups/'||r.page_id||'/raffles/'||r.id and g.status='published'
            and (g.celebrity_id is null or (c.status='published' and c.archived_at is null))
            and r.cancelled_at is null and r.drawn_at is null and now() >= r.opens_at and now() < r.closes_at)
      )
    ))
    and (p_area <> 'chemi-promo' or (
      now() >= b.popup_starts_at and now() < b.popup_ends_at
      and l.href in ('/chemi','/guide/chemi')
    ))
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null
  order by b.placement,b.sort_order,b.id)x),'{}'::jsonb);
end $$;

create or replace function public.get_admin_home_banner_manager(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
      'startsAt',b.popup_starts_at,'endsAt',b.popup_ends_at,
      'publicationStatus',b.publication_status,'sortOrder',b.sort_order,'revision',b.revision,
      'localizations',jsonb_build_object(
        'ko',jsonb_build_object('title',ko.title,'description',ko.description,'ctaLabel',ko.cta_label,'href',ko.href,'alt',ko.alt,'desktopImage',public.home_banner_asset_json(ko.desktop_asset_id),'mobileImage',public.home_banner_asset_json(ko.mobile_asset_id),'desktopVideo',ko.desktop_video,'mobileVideo',ko.mobile_video),
        'en',jsonb_build_object('title',en.title,'description',en.description,'ctaLabel',en.cta_label,'href',en.href,'alt',en.alt,'desktopImage',public.home_banner_asset_json(en.desktop_asset_id),'mobileImage',public.home_banner_asset_json(en.mobile_asset_id),'desktopVideo',en.desktop_video,'mobileVideo',en.mobile_video)
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
declare b public.home_banners; loc public.content_locale; payload jsonb; v_before jsonb; v_start timestamptz; v_end timestamptz; v_href text; v_placement text;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-banners',20260913));
  if p_localizations is null or jsonb_typeof(p_localizations)<>'object' or not (p_localizations ?& array['ko','en']) then raise exception 'invalid banner localizations'; end if;
  if p_kind='regular_live' and p_celebrity_id is null then raise exception 'celebrity required'; end if;
  v_placement := coalesce(p_placement, (select placement from public.home_banners where id=p_banner_id));
  if v_placement in ('member_event_popup','chemi_promo_popup') then
    v_start := (p_localizations->>'startsAt')::timestamptz;
    v_end := (p_localizations->>'endsAt')::timestamptz;
    v_href := p_localizations->'ko'->>'href';
    if p_kind<>'announcement' or v_start is null or v_end is null or not (v_start<v_end)
       or v_href is distinct from p_localizations->'en'->>'href'
       or (v_placement='chemi_promo_popup' and (v_href is null or v_href not in ('/chemi','/guide/chemi')))
       or (v_placement='member_event_popup' and not (
         exists(select 1 from public.live_events e where v_href='/live/'||e.slug)
         or exists(select 1 from public.group_raffles r where v_href='/pages/groups/'||r.page_id||'/raffles/'||r.id)
       )) then raise exception 'invalid scheduled popup'; end if;
  end if;
  if p_banner_id is null then
    if p_expected_revision is distinct from 0 then raise exception 'revision conflict'; end if;
    insert into public.home_banners(kind,celebrity_id,placement,category,popup_starts_at,popup_ends_at,sort_order) values(p_kind,p_celebrity_id,coalesce(p_placement,'home'),coalesce(p_category,case when p_kind='regular_live' then 'live' else 'announcement' end),v_start,v_end,coalesce((select max(sort_order)+1 from public.home_banners),0)) returning * into b;
  else
    select * into b from public.home_banners x where x.id=p_banner_id for update;
    if not found then raise exception 'banner not found'; end if;
    v_before:=to_jsonb(b);
    if b.revision is distinct from p_expected_revision then raise exception 'revision conflict'; end if;
    update public.home_banners set kind=p_kind,celebrity_id=p_celebrity_id,placement=coalesce(p_placement,b.placement),category=coalesce(p_category,b.category),popup_starts_at=v_start,popup_ends_at=v_end,revision=revision+1 where id=p_banner_id returning * into b;
  end if;
  foreach loc in array array['ko','en']::public.content_locale[] loop
    payload:=p_localizations->(loc::text);
    insert into public.home_banner_localizations(banner_id,locale,title,description,cta_label,href,alt,desktop_asset_id,mobile_asset_id,desktop_video,mobile_video)
    values(b.id,loc,coalesce(payload->>'title',''),coalesce(payload->>'description',''),coalesce(payload->>'ctaLabel',''),coalesce(payload->>'href',''),coalesce(payload->>'alt',''),nullif(payload->>'desktopAssetId','')::uuid,nullif(payload->>'mobileAssetId','')::uuid,nullif(payload->>'desktopVideo',''),nullif(payload->>'mobileVideo',''))
    on conflict(banner_id,locale) do update set title=excluded.title,description=excluded.description,cta_label=excluded.cta_label,href=excluded.href,alt=excluded.alt,desktop_asset_id=excluded.desktop_asset_id,mobile_asset_id=excluded.mobile_asset_id,desktop_video=excluded.desktop_video,mobile_video=excluded.mobile_video;
  end loop;
  if b.publication_status='published' and exists(
    select 1 from public.home_banner_localizations l where l.banner_id=b.id
      and (length(btrim(l.title))=0 or length(btrim(l.cta_label))=0 or length(btrim(l.alt))=0 or l.href='' or l.desktop_asset_id is null)
  ) then raise exception 'banner publication incomplete'; end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
  values(p_actor_app_user_id,p_actor_admin_allowlist_id,'home_banner.saved','home_banner',b.id::text,jsonb_build_object('before',v_before,'after',to_jsonb(b)),p_correlation_id);
  return jsonb_build_object('id',b.id,'revision',b.revision);
end $$;

notify pgrst, 'reload schema';
commit;

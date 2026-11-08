begin;
-- Managed banner slots (feedback C6): two on Home (under the board, between the two event cards) and two on every fan page (under the gallery, and a spare one under the stories).
-- External ads get their own category 'ad' so the page can label them.
-- A slot banner is an ordinary managed banner whose placement names the slot. The home and discovery sliders keep reading only
-- home, groups and both, so a slot banner never reaches them, and the save, publish and reorder commands with their admin checks stay as they are.
-- Order: this migration first, then the web. The deployed admin parses placements strictly, so slot banners are made only from the new admin.
set local lock_timeout='5s';
alter table public.home_banners drop constraint if exists home_banners_placement_check;
alter table public.home_banners add constraint home_banners_placement_check
  check (placement in ('home','groups','both','home_below_board','home_between_events','fanpage_below_gallery','fanpage_second'));
alter table public.home_banners drop constraint if exists home_banners_category_check;
alter table public.home_banners add constraint home_banners_category_check
  check (category in ('event','group','fanpage','announcement','live','guide','ad'));

-- One banner per slot: the first published, complete one in the managed order. An empty slot is left out, so the page folds it.
create or replace function public.read_published_slot_banners(p_locale public.content_locale,p_area text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_locale is null or p_area is null or p_area not in('home','fanpage')then raise exception 'invalid banner area' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(x.placement,x.banner) from(
  select distinct on(b.placement) b.placement,jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id)) banner
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement=any(case p_area when 'home' then array['home_below_board','home_between_events'] else array['fanpage_below_gallery','fanpage_second'] end) and b.publication_status='published'
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null
  order by b.placement,b.sort_order,b.id)x),'{}'::jsonb);
end $$;
revoke all on function public.read_published_slot_banners(public.content_locale,text) from public,anon,authenticated;
grant execute on function public.read_published_slot_banners(public.content_locale,text) to service_role;

-- Same owner rule as 20261209150000: the reader's owner may need execute on the asset helper.
do $$declare target_owner name;reader_owner name;begin
 select pg_get_userbyid(proowner) into target_owner from pg_proc where oid='public.home_banner_asset_json(uuid)'::regprocedure;
 select pg_get_userbyid(proowner) into reader_owner from pg_proc where oid='public.read_published_slot_banners(public.content_locale,text)'::regprocedure;
 if reader_owner in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner %',reader_owner;end if;
 if reader_owner<>target_owner then execute format('grant execute on function public.home_banner_asset_json(uuid) to %I',reader_owner);end if;
 if reader_owner<>(select pg_get_userbyid(relowner) from pg_class where oid='public.home_banners'::regclass) then
  execute format('grant select on table public.home_banners,public.home_banner_localizations to %I',reader_owner);
 end if;
end$$;
notify pgrst, 'reload schema';
commit;

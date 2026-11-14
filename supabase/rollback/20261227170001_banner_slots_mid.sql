-- Rollback for 20261227170001_banner_slots_mid.sql. Roll the web back first: the new web reads home_mid and the dukjil area, which then answer 503 and the slots fold.
-- Banners in the two new slots become drafts on Home before the constraint narrows. Nothing is deleted.
begin;
set local lock_timeout='5s';
update public.home_banners set placement='home',publication_status='draft',revision=revision+1 where placement in('home_mid','dukjil_mid');
alter table public.home_banners drop constraint home_banners_placement_check;
alter table public.home_banners add constraint home_banners_placement_check
  check (placement in ('home','groups','both','home_below_board','home_between_events','fanpage_below_gallery','fanpage_second'));
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
notify pgrst, 'reload schema';
commit;

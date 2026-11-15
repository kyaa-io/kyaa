-- Rollback for 20261227180001_banner_slot_dukjil_side.sql. Roll the web back first: the new web reads dukjil_side from the dukjil area and the admin offers it.
-- Banners in dukjil_side become drafts on Home before the constraint narrows. Nothing is deleted. The other slots stay as 20261227170001 left them.
begin;
set local lock_timeout='5s';
update public.home_banners set placement='home',publication_status='draft',revision=revision+1 where placement='dukjil_side';
alter table public.home_banners drop constraint home_banners_placement_check;
alter table public.home_banners add constraint home_banners_placement_check
  check (placement in ('home','groups','both','home_below_board','home_between_events','home_mid','fanpage_below_gallery','fanpage_second','dukjil_mid'));
create or replace function public.read_published_slot_banners(p_locale public.content_locale,p_area text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_locale is null or p_area is null or p_area not in('home','fanpage','dukjil')then raise exception 'invalid banner area' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(x.placement,x.banner) from(
  select distinct on(b.placement) b.placement,jsonb_build_object(
    'id',b.id,'kind',b.kind,'celebrityId',b.celebrity_id,'placement',b.placement,'category',b.category,
    'title',l.title,'description',l.description,'ctaLabel',l.cta_label,
    'href',l.href,'alt',l.alt,
    'desktopImage',public.home_banner_asset_json(l.desktop_asset_id),
    'mobileImage',public.home_banner_asset_json(l.mobile_asset_id)) banner
  from public.home_banners b
  join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
  where b.placement=any(case p_area when 'home' then array['home_below_board','home_between_events','home_mid'] when 'fanpage' then array['fanpage_below_gallery','fanpage_second'] else array['dukjil_mid'] end) and b.publication_status='published'
    and (b.kind<>'regular_live' or exists(select 1 from public.celebrities c where c.id=b.celebrity_id and c.status='published'))
    and length(btrim(l.title))>0 and length(btrim(l.cta_label))>0
    and length(btrim(l.alt))>0 and l.href<>'' and l.desktop_asset_id is not null
  order by b.placement,b.sort_order,b.id)x),'{}'::jsonb);
end $$;
revoke all on function public.read_published_slot_banners(public.content_locale,text) from public,anon,authenticated;
grant execute on function public.read_published_slot_banners(public.content_locale,text) to service_role;
notify pgrst, 'reload schema';
commit;

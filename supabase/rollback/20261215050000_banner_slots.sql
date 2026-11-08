-- Rollback for 20261215050000_banner_slots.sql. Roll the web back first: the new web reads the slot banners, which then answer 503 and the slots fold.
-- Ads become announcements. Slot banners have no place in the old placements, so they become drafts on Home before the constraint narrows. Nothing is deleted.
begin;
set local lock_timeout='5s';
update public.home_banners set placement='home',publication_status='draft',revision=revision+1 where placement in('home_below_board','home_between_events','fanpage_below_gallery','fanpage_second');
update public.home_banners set category='announcement',revision=revision+1 where category='ad';
drop function public.read_published_slot_banners(public.content_locale,text);
alter table public.home_banners drop constraint home_banners_placement_check;
alter table public.home_banners add constraint home_banners_placement_check check (placement in ('home','groups','both'));
alter table public.home_banners drop constraint home_banners_category_check;
alter table public.home_banners add constraint home_banners_category_check check (category in ('event','group','fanpage','announcement','live','guide'));
notify pgrst, 'reload schema';
commit;

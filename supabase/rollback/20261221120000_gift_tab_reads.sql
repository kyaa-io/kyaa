begin;
-- Deploy the previous web first: nothing in it reads the gift tables. Read state is dropped; the next release backfills it again.
drop function if exists public.mark_owned_gift_read(uuid, uuid);
drop function if exists public.get_owned_gift_unread(uuid);
drop function if exists public.get_owned_gift(uuid, uuid, public.content_locale);
drop function if exists public.get_owned_gifts(uuid, public.content_locale);
drop table if exists public.benefit_gift_reads;
drop function if exists public.benefit_gift_stage(public.benefit_fulfillment_status);
commit;

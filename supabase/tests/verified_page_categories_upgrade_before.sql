\set ON_ERROR_STOP on
-- DEV shape before the category migration: a published singer and a draft actor. Updating them queues the deferred
-- publication and welcome-notice triggers, the case that stopped the DEV apply on 2026-11-26.
begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('fa300000-0000-4000-8000-000000000001','category-up-singer','published','/images/category-up.jpg',now(),'{artist}','singer'),
 ('fa300000-0000-4000-8000-000000000002','category-up-actor','draft','/images/category-up.jpg',null,'{artist}','actor');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa300000-0000-4000-8000-000000000001','ko','분류 가수','가수 소개','가수 사진'),
 ('fa300000-0000-4000-8000-000000000001','en','Category Singer','About singer','Singer photo'),
 ('fa300000-0000-4000-8000-000000000002','ko','분류 배우','배우 소개','배우 사진'),
 ('fa300000-0000-4000-8000-000000000002','en','Category Actor','About actor','Actor photo');
commit;

-- DEV applies each migration file in one transaction. Do the same here, then roll back so the chain applies it as usual.
begin;
\ir ../migrations/20270116070100_verified_page_categories.sql
do $$ begin
  if exists(select 1 from public.celebrities where id in ('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002')
            and primary_role is distinct from 'creator') then
    raise exception 'one-transaction apply left an old category';
  end if;
end $$;
rollback;

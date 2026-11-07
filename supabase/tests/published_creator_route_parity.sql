\set ON_ERROR_STOP on
-- Only disposable local data. A fan group links to /{slug}; the page reads
-- published_celebrities, which also needs a fan count. Clearing it on a
-- published creator left the group listed while its page answered 404.
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end $$;
begin;
do $$
declare creator uuid:=gen_random_uuid();page uuid:=gen_random_uuid();listed boolean;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,fan_count,roles,primary_role)values(creator,'route-parity-fixture','published','/fixture.webp',now(),10,'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','경로 확인','확인','확인'),(creator,'en','Route','Check','Check');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Route parity');
 select exists(select 1 from jsonb_array_elements(public.groups_dispatch('directory',null,null,null,'{"limit":50,"search":"Route parity"}'::jsonb)->'items')i where i->>'id'=page::text)into listed;
 if not listed or (select count(*)from public.published_celebrities where slug='route-parity-fixture')<>2 then raise exception 'Fixture is not both listed and routable';end if;
 begin
  update public.celebrities set fan_count=null where id=creator;
  raise exception 'Published creator lost its fan count';
 exception when others then if sqlerrm not like '%requires fan count%' then raise;end if;
 end;
 if (select count(*)from public.published_celebrities where slug='route-parity-fixture')<>2 then raise exception 'Listed creator page is not routable';end if;
 -- A draft can still be saved without a count; publication checks it later.
 update public.celebrities set status='draft',published_at=null where id=creator;
 update public.celebrities set fan_count=null where id=creator;
end $$;
rollback;

\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
create table public._group_default_rooms_upgrade_fixture(fan_page uuid,hobby_page uuid,legacy_room uuid);
do $$declare creator uuid:=gen_random_uuid();fan uuid:=gen_random_uuid();hobby uuid:=gen_random_uuid();legacy uuid:=gen_random_uuid();begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'default-rooms-upgrade-'||creator,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','기본방','소개','사진'),(creator,'en','Default rooms','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(fan,'fan',creator,'Existing fan page'),(hobby,'hobby',null,'Existing hobby page');
 -- A manually made room that already exists must stay untouched.
 insert into public.group_rooms(id,page_id,name,minimum_tier)values(legacy,fan,'Manual room','Gold');
 if exists(select 1 from public.group_rooms where page_id=fan and default_key is not null)then raise exception 'Fixture must start without default rooms';end if;
 insert into public._group_default_rooms_upgrade_fixture values(fan,hobby,legacy);
end $$;

\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$declare f public._group_default_rooms_upgrade_fixture;creator uuid:=gen_random_uuid();created uuid:=gen_random_uuid();brand uuid:=gen_random_uuid();before_count bigint;begin
 select *into strict f from public._group_default_rooms_upgrade_fixture;
 -- Backfill: the existing fan page now has the three default rooms plus its manual room.
 if (select count(*) from public.group_rooms where page_id=f.fan_page)<>4 or (select count(*) from public.group_rooms where page_id=f.fan_page and default_key is not null)<>3 then raise exception 'Existing fan page was not backfilled';end if;
 if not exists(select 1 from public.group_rooms where page_id=f.fan_page and default_key='artist' and name='아티스트 소통방' and minimum_tier='Bronze')
  or not exists(select 1 from public.group_rooms where page_id=f.fan_page and default_key='certified' and name='인증팬 소통방' and minimum_tier='Bronze')
  or not exists(select 1 from public.group_rooms where page_id=f.fan_page and default_key='free' and name='자유 소통방' and minimum_tier is null) then raise exception 'Default room contract changed';end if;
 if not exists(select 1 from public.group_rooms where id=f.legacy_room and default_key is null and name='Manual room' and minimum_tier='Gold') then raise exception 'Manual room was changed';end if;
 if exists(select 1 from public.group_rooms where page_id=f.hobby_page) then raise exception 'Hobby page must not get fan default rooms';end if;
 -- Idempotent: running the backfill again adds nothing.
 select count(*) into before_count from public.group_rooms;
 perform public.group_ensure_default_rooms(id) from public.group_pages where kind='fan';
 if (select count(*) from public.group_rooms)<>before_count then raise exception 'Backfill is not idempotent';end if;
 -- New pages get rooms at creation, without any member opening the list.
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'default-rooms-new-'||creator,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','기본방','소개','사진'),(creator,'en','Default rooms','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(created,'fan',creator,'New fan page');
 if (select count(*) from public.group_rooms where page_id=created and default_key is not null)<>3 then raise exception 'New fan page has no default rooms';end if;
 insert into public.group_pages(id,kind,name)values(brand,'hobby','New hobby page');
 if exists(select 1 from public.group_rooms where page_id=brand) then raise exception 'New hobby page got rooms';end if;
 -- The lazy path in the room list must not duplicate them.
 perform public.group_ensure_default_rooms(created);
 if (select count(*) from public.group_rooms where page_id=created)<>3 then raise exception 'Duplicate default rooms';end if;
 if has_function_privilege('service_role','public.group_ensure_default_rooms(uuid)','execute') or has_function_privilege('authenticated','public.group_ensure_default_rooms(uuid)','execute') then raise exception 'Helper is callable from API roles';end if;
 raise notice 'PASS default rooms backfill, creation trigger, idempotency, manual room and hobby page untouched, grants closed';
end $$;
rollback;

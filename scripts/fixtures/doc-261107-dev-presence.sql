-- DEV ONLY. Sets what the bound synthetic artist shows on elina and the test page [16].
-- byus.doc261107_presence: online (shows as connected for the next two hours), today (visited today), off (shows nothing).
begin;
set local lock_timeout = '5s';
do $$declare mode text:=current_setting('byus.doc261107_presence',true);artist uuid:='d2611001-0000-4000-8000-000000000121';begin
 if current_setting('byus.doc261107_dev',true) is distinct from 'SEED_DOC_261107_DEV_ONLY' then raise exception 'DOC261107_CONFIRMATION_REQUIRED';end if;
 if inet_server_addr() is not null and host(inet_server_addr()) !~ '^(10\.40\.|127\.)' then raise exception 'DOC261107_NOT_DEV_SERVER';end if;
 if mode is null or mode not in('online','today','off') then raise exception 'DOC261107_PRESENCE_MODE';end if;
 if (select count(*) from public.group_artist_bindings where app_user_id=artist)<>2 then raise exception 'DOC261107_SEED_FIRST';end if;
 delete from public.group_presence where app_user_id=artist;
 delete from public.group_visits where app_user_id=artist;
 if mode<>'off' then
  insert into public.group_visits select page_id,artist,(now() at time zone 'Asia/Seoul')::date from public.group_artist_bindings where app_user_id=artist;
 end if;
 if mode='online' then
  insert into public.group_presence select page_id,artist,now()+interval '2 hours' from public.group_artist_bindings where app_user_id=artist;
 end if;
end $$;
commit;

do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
\ir live_participation_fixture.sql
create table public.live_participation_test_ids(key text primary key,id uuid not null);
do $$declare a uuid;b uuid;c uuid;cert uuid;mid uuid;s jsonb;u uuid;o uuid;key text;i integer;begin
 a:=pg_temp.live(1999,now()-interval'2 hours',now()-interval'1 hour');b:=pg_temp.live(2000,now()+interval'1 hour',now()+interval'2 hours');c:=pg_temp.live(2001,now()-interval'1 minute',now()+interval'1 hour');
 perform pg_temp.live(2002,now()-interval'1 minute',now()+interval'1 hour');
 mid:=pg_temp.mission(b,'reserve','reservation');insert into public.live_participation_test_ids values('reserve',mid);
 mid:=pg_temp.mission(a,'nextreserve','reservation',null,null,b);insert into public.live_participation_test_ids values('nextreserve',mid);
 mid:=pg_temp.mission(c,'attendance','attendance');insert into public.live_participation_test_ids values('attendance',mid);
 foreach key in array array['early','first']loop
 cert:=pg_temp.cert('concurrent-'||key);perform pg_temp.mission(c,key,'image',cert);
 for i in 7..8 loop
 o:=pg_temp.uuid(100+i);u:=extensions.gen_random_uuid();perform public.register_owned_certification_upload(o,cert,u,o||'/'||cert||'/'||u||'.webp',100,10,10,repeat('a',64));
 s:=public.submit_owned_certification(o,cert,extensions.gen_random_uuid(),jsonb_build_array(u),null,null);insert into public.live_participation_test_ids values(key||'-'||i,(s->>'id')::uuid);
 end loop;end loop;
 c:=pg_temp.uuid(2002);mid:=pg_temp.mission(c,'attendance','attendance');insert into public.live_participation_test_ids values('attendance-active',mid);
 foreach key in array array['early','first']loop
 cert:=pg_temp.cert('concurrent-active-'||key);perform pg_temp.mission(c,key,'image',cert);o:=pg_temp.uuid(108);u:=extensions.gen_random_uuid();
 perform public.register_owned_certification_upload(o,cert,u,o||'/'||cert||'/'||u||'.webp',100,10,10,repeat('b',64));
 s:=public.submit_owned_certification(o,cert,extensions.gen_random_uuid(),jsonb_build_array(u),null,null);insert into public.live_participation_test_ids values(key||'-active',(s->>'id')::uuid);
 end loop;
 end $$;
commit;

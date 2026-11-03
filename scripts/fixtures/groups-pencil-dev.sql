-- Synthetic dev data only. No authentication binding, chain jobs, wallet or raffle records.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '55s';
do $$begin perform pg_advisory_xact_lock(hashtextextended('groups-pencil-dev-v1',0));end $$;
create or replace function pg_temp.fixture_id(kind integer,n integer) returns uuid language sql immutable as $$
 select ('f16'||kind::text||'0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
do $$begin
 if current_setting('byus.groups_pencil_dev',true) is distinct from 'SEED_GROUPS_PENCIL_DEV_ONLY' then raise exception 'DEV_FIXTURE_CONFIRMATION_REQUIRED';end if;
 if exists(select 1 from public.telegram_alert_settings where enabled and activated_at <= '2020-01-01'::timestamptz) then raise exception 'DEV_FIXTURE_ALERT_WINDOW_UNSAFE';end if;
end $$;
-- Lock the relevant tables so ownership checks and upserts cannot race a new real membership.
lock table public.app_users,public.celebrities,public.group_pages,public.group_memberships,
 public.group_posts,public.group_rooms,public.group_messages,public.group_events,
 public.group_collections,public.group_missions,public.group_event_registrations,
 public.group_mission_submissions,public.group_applications,public.fan_posts,public.celebrity_notices in share row exclusive mode;
create temp table fixture_actor_identities(n integer primary key check(n between 1 and 3),privy_id text not null unique,email text not null unique) on commit drop;
insert into fixture_actor_identities select (x->>'n')::int,x->>'privyUserId',x->>'email' from jsonb_array_elements(coalesce(nullif(current_setting('byus.groups_pencil_identities',true),''),'[]')::jsonb)x;
do $$begin
 if (select count(*)from fixture_actor_identities)not in(0,3)then raise exception 'DEV_FIXTURE_IDENTITY_MAP_INCOMPLETE';end if;
 if exists(select 1 from fixture_actor_identities m where not exists(select 1 from public.app_users u join public.user_wallets w on w.app_user_id=u.id and w.chain_id=91342 where u.id=pg_temp.fixture_id(1,m.n)and u.privy_user_id=m.privy_id and u.verified_email=m.email))then raise exception 'DEV_FIXTURE_AUTH_BIND_REQUIRED';end if;
end $$;
create or replace function pg_temp.fixture_privy(n integer)returns text language sql stable as $$select coalesce((select privy_id from fixture_actor_identities where fixture_actor_identities.n=$1),'fixture:groups-pencil-dev:'||$1)$$;
create or replace function pg_temp.fixture_email(n integer)returns text language sql stable as $$select coalesce((select email from fixture_actor_identities where fixture_actor_identities.n=$1),'groups-pencil-dev-'||$1||'@example.test')$$;
create temp table fixture_pages(n integer primary key,name text,kind text,description text,image_url text) on commit drop;
insert into fixture_pages values
 (1,'엔카이브 팬페이지','fan','공식 영상과 LIVE 소식','/images/groups/nchive-pencil.jpg'),
 (2,'엘리나 팬페이지','fan','음악·일상 소식과 응원 글','/images/groups/elina-pencil.jpg'),
 (3,'한강 러닝 크루','hobby','같이 달리고 러닝 기록을 나눠요.','/images/groups/running-event.png'),
 (4,'RUN&MUSIC FESTIVAL','brand','러닝·음악 행사 모임','/images/groups/runmusic-pencil.jpg'),
 (5,'사진 산책 모임','hobby','일상의 순간을 사진으로 나눠요.','/images/groups/photo-placeholder.svg'),
 (6,'주말 독서 모임','hobby','함께 읽고 감상을 나눠요.','/images/groups/reading-placeholder.svg'),
 (7,'인디 음악 모임','hobby','좋아하는 음악과 공연 소식','/images/groups/music-placeholder.svg'),
 (8,'공연 기록 모임','hobby','다녀온 공연의 순간을 나눠요.','/images/groups/concert-placeholder.svg'),
 (9,'영화산책','hobby','',null),(10,'아침요가','hobby','',null),(11,'커피노트','hobby','',null),
 (12,'전시산책','hobby','',null),(13,'여행기록','hobby','',null),(14,'동네산책','hobby','',null);
create temp table fixture_applications(n integer primary key,kind text,name text,description text,status text,reason text,page_n integer) on commit drop;
insert into fixture_applications values
 (1,'fan','엔카이브 팬페이지','엔카이브의 영상과 소식을 함께 나누는 팬페이지입니다.','submitted',null,null),
 (2,'fan','아티스트 팬페이지','아티스트의 음악과 일상을 함께 응원합니다.','changes_requested','아티스트와의 관계를 확인할 자료를 보완해 주세요.',null),
 (3,'hobby','한강 러닝 크루','한강에서 함께 달리고 러닝 기록을 나눠요.','approved',null,3),
 (4,'brand','브랜드 페이지','브랜드 소식과 행사를 소개합니다.','rejected','신청 자료에서 운영 주체를 확인할 수 없습니다.',null);
create temp table fixture_fan_posts(n integer primary key,creator_n integer,author_n integer,body text) on commit drop;
insert into fixture_fan_posts
 select (c-1)*7+p,c,p+5,replace((array['오늘 같이 본 영상 이야기해요','가장 좋아하는 무대가 궁금해요','팬아트와 응원 사진을 나눠요','엔카이브를 처음 알게 된 순간부터 지금까지','다음에 같이 보고 싶은 콘텐츠','오늘도 함께 응원해요','직접 만든 응원 배경화면을 공유해요'])[p],'엔카이브',case c when 1 then '엔카이브' else '엘리나' end)
 from generate_series(1,2)c cross join generate_series(1,7)p;
create temp table fixture_videos(n integer primary key,title text,url text) on commit drop;
-- Original titles and URLs preserved from the approved design's video-live-benchmark metadata.
insert into fixture_videos values
 (1,'엔카이브 (NCHIVE) - Racer Practice Video','https://www.youtube.com/watch?v=llP16jxxEsU'),
 (2,'NCHIVE, Racer (엔카이브, Racer) [THE SHOW 240416]','https://www.youtube.com/watch?v=Q7d6ueFBoiQ');
do $$declare n integer;k integer;t text;collision boolean;begin
 if exists(select 1 from public.celebrity_notices p join fixture_videos f on p.id=('f1730000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid where p.celebrity_id<>pg_temp.fixture_id(2,1) or p.slug<>'groups-pencil-video-'||f.n)then raise exception 'DEV_FIXTURE_VIDEO_COLLISION';end if;
 if exists(select 1 from public.fan_posts p join fixture_fan_posts f on p.id=('f1720000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid where p.celebrity_id<>pg_temp.fixture_id(2,f.creator_n) or p.app_user_id<>pg_temp.fixture_id(1,f.author_n))then raise exception 'DEV_FIXTURE_FAN_POST_COLLISION';end if;
 if exists(select 1 from public.group_applications a join fixture_applications f on a.id=('f1710000-0000-4000-8000-'||lpad(f.n::text,12,'0'))::uuid where a.applicant_id<>pg_temp.fixture_id(1,1) or a.kind<>f.kind)then raise exception 'DEV_FIXTURE_APPLICATION_COLLISION';end if;
 for n in 1..2450 loop
  if exists(select 1 from public.app_users where id=pg_temp.fixture_id(1,n) and (privy_user_id is distinct from pg_temp.fixture_privy(n) or verified_email is distinct from pg_temp.fixture_email(n))) then raise exception 'DEV_FIXTURE_ACTOR_COLLISION';end if;
 end loop;
 for n in 1..2 loop
  if exists(select 1 from public.celebrities where id=pg_temp.fixture_id(2,n) and slug is distinct from ('groups-pencil-dev-'||n)) then raise exception 'DEV_FIXTURE_CREATOR_COLLISION';end if;
 end loop;
 if exists(select 1 from public.group_pages g join fixture_pages f on g.id=pg_temp.fixture_id(3,f.n) where not exists(select 1 from public.group_memberships m join public.app_users u on u.id=m.app_user_id where m.page_id=g.id and m.role='owner' and m.app_user_id=pg_temp.fixture_id(1,1) and u.privy_user_id=pg_temp.fixture_privy(1) and u.verified_email=pg_temp.fixture_email(1)) or g.kind<>f.kind or g.celebrity_id is distinct from case when f.kind='fan' then pg_temp.fixture_id(2,f.n) end) then raise exception 'DEV_FIXTURE_PAGE_COLLISION';end if;
 if exists(select 1 from public.group_memberships m join fixture_pages f on m.page_id=pg_temp.fixture_id(3,f.n) where m.app_user_id not in(select pg_temp.fixture_id(1,i) from generate_series(1,2450)i)) then raise exception 'DEV_FIXTURE_PAGE_SHARED';end if;
 if exists(select 1 from public.group_posts p join fixture_pages f on p.id=pg_temp.fixture_id(4,f.n) where p.author_id<>pg_temp.fixture_id(1,1))or exists(select 1 from public.group_events e join fixture_pages f on e.id=pg_temp.fixture_id(7,f.n) where e.created_by<>pg_temp.fixture_id(1,1))then raise exception 'DEV_FIXTURE_AUTHOR_COLLISION';end if;
 for n in 1..2 loop
  if exists(select 1 from public.group_rooms where id=pg_temp.fixture_id(5,n+14) and page_id<>pg_temp.fixture_id(3,n))then raise exception 'DEV_FIXTURE_ROOM_COLLISION';end if;
 end loop;
 -- Existing stable IDs must belong to the same fixture page (or fixture room for messages).
 foreach t in array array['group_posts','group_rooms','group_messages','group_events','group_collections','group_missions'] loop
  k:=array_position(array['group_posts','group_rooms','group_messages','group_events','group_collections','group_missions'],t)+3;
  for n in 1..14 loop
   if t='group_messages' then
    if exists(select 1 from public.group_messages where id=pg_temp.fixture_id(k,n) and (room_id<>pg_temp.fixture_id(5,n) or author_id<>pg_temp.fixture_id(1,1))) then raise exception 'DEV_FIXTURE_CONTENT_COLLISION';end if;
   else
    execute format('select exists(select 1 from public.%I where id=$1 and page_id<>$2)',t) into strict collision using pg_temp.fixture_id(k,n),pg_temp.fixture_id(3,n);
    if collision then raise exception 'DEV_FIXTURE_CONTENT_COLLISION';end if;
   end if;
  end loop;
 end loop;
end $$;
insert into public.app_users(id,privy_user_id,verified_email,created_at)
 select pg_temp.fixture_id(1,n),pg_temp.fixture_privy(n),pg_temp.fixture_email(n),'2020-01-01' from generate_series(1,2450)n on conflict(id) do nothing;
insert into public.user_profiles(app_user_id,nickname,nickname_normalized)
 select pg_temp.fixture_id(1,n),coalesce((array['별빛','하늘','보라','은하','스타벅스라이프'])[n],'팬 '||n),coalesce((array['별빛','하늘','보라','은하','스타벅스라이프'])[n],'팬 '||n) from generate_series(1,2450)n on conflict(app_user_id) do nothing;
insert into public.app_user_avatars(app_user_id,initial_character_id,selected_character_id)
 select pg_temp.fixture_id(1,n),'star-pink',(array['star-pink','star-cream','heart-pink','fairy-lavender','ghost-cream'])[(n-1)%5+1] from generate_series(1,2450)n on conflict(app_user_id) do nothing;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role,fan_count)
 select pg_temp.fixture_id(2,n),'groups-pencil-dev-'||n,'published',image_url,'2020-01-01','{creator}','creator',(array[1280,356])[n] from fixture_pages where n<=2 on conflict(id) do update set image_url=excluded.image_url,fan_count=excluded.fan_count;
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select pg_temp.fixture_id(2,n),locale,name,description,name from fixture_pages cross join unnest(array['ko','en']::public.content_locale[])locale where n<=2 on conflict(celebrity_id,locale) do update set name=excluded.name,summary=excluded.summary,image_alt=excluded.image_alt;
insert into public.group_pages(id,kind,celebrity_id,name,description,image_url,status,question,created_at)
 select pg_temp.fixture_id(3,n),kind,case when kind='fan' then pg_temp.fixture_id(2,n) end,name,
 description,image_url,'published','함께하고 싶은 활동을 알려주세요.','2026-11-01'::timestamptz-n*interval '1 minute' from fixture_pages
 on conflict(id) do update set name=excluded.name,description=excluded.description,image_url=excluded.image_url,status=excluded.status,question=excluded.question;
insert into public.group_memberships(page_id,app_user_id,role)
 select pg_temp.fixture_id(3,f.n),pg_temp.fixture_id(1,a),case a when 1 then 'owner' when 3 then 'manager' else 'member' end
 from fixture_pages f cross join lateral generate_series(1,coalesce((array[1280,356,84,2450,128,96,214,173])[f.n],3)+case when f.n>4 then 1 else 0 end)a where a<>2 or f.n<=4 on conflict(page_id,app_user_id) do nothing;
-- Preserve reviews performed in dev; reruns must not reset decisions or emit review notifications.
insert into public.group_applications(id,applicant_id,kind,name,description,status,reason,page_id,created_at)
 select ('f1710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.fixture_id(1,1),kind,name,description,status,reason,case when page_n is not null then pg_temp.fixture_id(3,page_n) end,'2026-11-01'::timestamptz-n*interval '1 minute' from fixture_applications
 on conflict(id) do nothing;
insert into public.group_bookmarks(page_id,app_user_id) values(pg_temp.fixture_id(3,5),pg_temp.fixture_id(1,2)) on conflict do nothing;
insert into public.group_notification_settings(page_id,app_user_id,enabled) values(pg_temp.fixture_id(3,1),pg_temp.fixture_id(1,2),false) on conflict do nothing;
insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous)
 select pg_temp.fixture_id(4,n),pg_temp.fixture_id(3,n),pg_temp.fixture_id(1,1),coalesce(nullif(description,''),name),coalesce(nullif(description,''),name),case when n%2=0 then 'members' else 'public' end,n%3=0 from fixture_pages
 on conflict(id) do update set title=excluded.title,body=excluded.body,visibility=excluded.visibility,anonymous=excluded.anonymous;
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
 select ('f1730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.fixture_id(2,1),'groups-pencil-video-'||n,'published','2020-01-01'::timestamptz-n*interval '1 minute','2020-01-01' from fixture_videos on conflict(id) do nothing;
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
 select ('f1730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,locale,title,jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',title,'marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href',url))))))))
 from fixture_videos cross join unnest(array['ko','en']::public.content_locale[])locale on conflict(notice_id,locale) do nothing;
-- These display fixtures do not award first-post stamps or tickets; preserve edits on rerun.
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)
 select ('f1720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.fixture_id(2,creator_n),pg_temp.fixture_id(1,author_n),body,('f1720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'groups-pencil-dev-v1:'||n,false,'2026-11-01'::timestamptz-n*interval '1 minute' from fixture_fan_posts
 on conflict(id) do nothing;
insert into public.group_rooms(id,page_id,name,minimum_tier,status)
 select pg_temp.fixture_id(5,n),pg_temp.fixture_id(3,n),case when kind='fan' then '아티스트와 함께' else name||' 대화방' end,case when kind='fan' then 'Gold' else 'Bronze' end,case when kind='fan' then 'open' else (array['open','scheduled','readonly','closed'])[(n-1)%4+1] end from fixture_pages
 on conflict(id) do update set name=excluded.name,status=excluded.status,minimum_tier=excluded.minimum_tier;
insert into public.group_rooms(id,page_id,name,minimum_tier,status)
 select pg_temp.fixture_id(5,n+14),pg_temp.fixture_id(3,n),'응원 이야기','Gold','open' from fixture_pages where kind='fan'
 on conflict(id) do nothing;
insert into public.group_messages(id,room_id,author_id,body)
 select pg_temp.fixture_id(6,n),pg_temp.fixture_id(5,n),pg_temp.fixture_id(1,1),case when kind='fan' then '오늘도 함께 응원해 주셔서 고마워요!' else coalesce(nullif(description,''),name) end from fixture_pages on conflict(id) do update set body=excluded.body;
insert into public.group_events(id,page_id,title,description,image_url,starts_at,ends_at,opens_at,closes_at,location,capacity,requires_approval,state,created_by)
 select pg_temp.fixture_id(7,n),pg_temp.fixture_id(3,n),case when n=3 then '한강 러닝 크루 정기 모임' else name end,case when n=3 then '편한 복장으로 와주세요.' else description end,image_url,case when n=3 then '2026-11-07T00:00:00Z'::timestamptz else now()+interval '14 days' end,case when n=3 then '2026-11-07T03:00:00Z'::timestamptz else now()+interval '14 days 2 hours' end,now()-interval '1 day',case when n=3 then '2026-11-06T23:00:00Z'::timestamptz else now()+interval '13 days' end,case when n=3 then '한강공원' else '서울' end,30,n%2=0,'published',pg_temp.fixture_id(1,1) from fixture_pages
 on conflict(id) do update set title=excluded.title,description=excluded.description,image_url=excluded.image_url,location=excluded.location,starts_at=excluded.starts_at,ends_at=excluded.ends_at,opens_at=excluded.opens_at,closes_at=excluded.closes_at;
insert into public.group_collections(id,page_id,title,image_url,external_url,status)
 select pg_temp.fixture_id(8,n),pg_temp.fixture_id(3,n),name||' 컬렉션','/images/groups/capsule-closed.png','https://example.test/groups-pencil-dev/'||n,case when n%2=0 then 'sold_out' else 'active' end from fixture_pages on conflict(id) do nothing;
insert into public.group_missions(id,page_id,title,instructions,image_url,state,reward_points,reward_budget)
 select pg_temp.fixture_id(9,n),pg_temp.fixture_id(3,n),coalesce(nullif(description,''),name),coalesce(nullif(description,''),name),image_url,'published',0,0 from fixture_pages on conflict(id) do nothing;
insert into public.group_event_registrations(id,event_id,app_user_id,status)
 select pg_temp.fixture_id(0,n),pg_temp.fixture_id(7,n),pg_temp.fixture_id(1,2),case when n%2=0 then 'pending' else 'confirmed' end from fixture_pages where n<=4 on conflict(event_id,app_user_id) do nothing;
insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,reward_points)
 select ('f1700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.fixture_id(9,n),pg_temp.fixture_id(1,2),coalesce(nullif(description,''),name),(array['pending','rejected','completed','pending'])[n],0 from fixture_pages where n<=4 on conflict(mission_id,app_user_id) do nothing;
do $$begin
 if (select count(*) from public.group_pages where id in(select pg_temp.fixture_id(3,n)from fixture_pages)and status='published')<>14 then raise exception 'DEV_FIXTURE_PAGE_COUNT';end if;
 if (select count(*) from public.group_memberships where app_user_id=pg_temp.fixture_id(1,2))<>4 then raise exception 'DEV_FIXTURE_JOINED_COUNT';end if;
 if exists(select 1 from public.telegram_alert_outbox where source_id in(select pg_temp.fixture_id(1,n)from generate_series(1,2450)n)) then raise exception 'DEV_FIXTURE_ALERT_SIDE_EFFECT';end if;
end $$;
select jsonb_build_object('fixture','groups-pencil-dev-v1','pages',14,'viewerActorId',pg_temp.fixture_id(1,2),'joined',4,'adminApplications',4,'authenticationBound',(select count(*)=3 from fixture_actor_identities),'walletSeeded',false,'rafflesSeeded',false);
commit;

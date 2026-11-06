-- DEV ONLY synthetic data for judging the 2026-11-07 feedback UI. Never a migration, never production.
-- Every synthetic id starts with d26110, nicknames start with 시험, titles start with [시험]. See doc-261107-dev.md.
-- Triggers are off for this transaction (session_replication_role=replica), so no chain job, notification, stamp,
-- ticket, point, alert or product event can start from these rows. A role that may not set it stops here with nothing written.
-- Depends on doc-14 data: the elina creator and its page must exist. Rerun: existing rows stay, nothing is duplicated.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '55s';
do $$begin
 if current_setting('byus.doc261107_dev',true) is distinct from 'SEED_DOC_261107_DEV_ONLY' then raise exception 'DOC261107_CONFIRMATION_REQUIRED';end if;
 if inet_server_addr() is not null and host(inet_server_addr()) !~ '^(10\.40\.|127\.)' then raise exception 'DOC261107_NOT_DEV_SERVER';end if;
 perform pg_advisory_xact_lock(hashtextextended('doc-261107-dev',0));
end $$;
set local session_replication_role = replica;

create or replace function pg_temp.fid(kind integer,n integer) returns uuid language sql immutable as $$
 select ('d26110'||lpad(kind::text,2,'0')||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
-- Rows that belong to a real viewer get ids derived from that viewer, so a rerun finds them again.
create or replace function pg_temp.vid(label text,viewer uuid) returns uuid language sql immutable as $$
 select md5('doc-261107:'||label||':'||viewer::text)::uuid
$$;

create temp table fixture_viewers(id uuid primary key) on commit drop;
create temp table fixture_ref(elina_celebrity uuid not null,elina_page uuid not null,admin_id uuid not null) on commit drop;
do $$declare wanted text[]:=coalesce(nullif(string_to_array(coalesce(current_setting('byus.doc261107_viewer_emails',true),''),','),'{}'),'{}');
 v_celebrity uuid;v_page uuid;v_admin uuid;begin
 insert into fixture_viewers select u.id from public.app_users u where u.verified_email=any(wanted) and u.status='active';
 if (select count(*) from fixture_viewers)<>cardinality(wanted) then raise exception 'DOC261107_VIEWER_NOT_FOUND';end if;
 select c.id,g.id into v_celebrity,v_page from public.celebrities c join public.group_pages g on g.celebrity_id=c.id where c.slug='elina' and c.status='published' and c.archived_at is null and g.status='published';
 if v_page is null then raise exception 'DOC261107_ELINA_PAGE_MISSING';end if;
 select id into v_admin from public.admin_allowlist where active order by created_at,id limit 1;
 if v_admin is null then raise exception 'DOC261107_NO_ADMIN';end if;
 insert into fixture_ref values(v_celebrity,v_page,v_admin);
 if exists(select 1 from public.app_users where id::text like 'd2611001-%' and privy_user_id not like 'fixture:doc-261107:%') then raise exception 'DOC261107_ACTOR_COLLISION';end if;
 if exists(select 1 from public.celebrities where (id=pg_temp.fid(2,1))<>(slug='doc261107-test-ranking') and (id=pg_temp.fid(2,1) or slug='doc261107-test-ranking')) then raise exception 'DOC261107_CREATOR_COLLISION';end if;
end $$;

-- 120 fans, then the bound artist (121).
create temp table fixture_fans as select n,pg_temp.fid(1,n) id,
  greatest(3,300-((n-1)*5)/2) points,
  ceil((121-n)/10.0)::integer hearts,
  timestamptz '2026-10-01 10:00+09'+(n*interval '37 minutes') joined_at
 from generate_series(1,120) n;
insert into public.app_users(id,privy_user_id,verified_email,created_at)
 select pg_temp.fid(1,n),'fixture:doc-261107:'||n,'doc-261107-'||n||'@example.test','2020-01-01' from generate_series(1,121) n
 on conflict(id) do nothing;
insert into public.user_profiles(app_user_id,nickname,nickname_normalized)
 select pg_temp.fid(1,n),x.name,x.name from generate_series(1,121) n
 cross join lateral (select case when n=121 then '시험 아티스트' when n=3 then '시험팬 이름이 아주 길어서 줄바꿈과 말줄임을 함께 확인하는 회원' else '시험팬 '||lpad(n::text,3,'0') end name) x
 on conflict(app_user_id) do nothing;
insert into public.app_user_avatars(app_user_id,initial_character_id,selected_character_id)
 select pg_temp.fid(1,n),'star-pink',(array['star-pink','fairy-lavender','ghost-cream','fairy-pink','fairy-cream','ghost-lavender'])[(n-1)%6+1] from generate_series(1,121) n
 on conflict(app_user_id) do nothing;
-- Fans 7, 8 and 9 give each message setting a row to check the conversation conditions against.
insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy)
 select pg_temp.fid(1,n),true,p from (values(7,'friends'),(8,'requests'),(9,'none')) v(n,p) on conflict(app_user_id) do nothing;

insert into public.celebrities(id,slug,status,image_url,published_at,ever_published_at,roles,primary_role,fan_count)
 values(pg_temp.fid(2,1),'doc261107-test-ranking','published','/images/groups/capsule-machine.png','2026-10-01','2026-10-01','{creator}','creator',120)
 on conflict(id) do nothing;
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 (pg_temp.fid(2,1),'ko','[시험] 랭킹 확인 페이지','dev 합성 자료입니다.','시험 페이지 이미지'),
 (pg_temp.fid(2,1),'en','[Test] Ranking page','Synthetic dev data.','Test page image')
 on conflict(celebrity_id,locale) do nothing;
insert into public.group_pages(id,kind,celebrity_id,name,description,image_url,status,created_at) values
 (pg_temp.fid(3,1),'fan',pg_temp.fid(2,1),'[시험] 랭킹 확인 페이지','dev 합성 자료입니다.','/images/groups/capsule-machine.png','published','2026-10-01'),
 (pg_temp.fid(3,2),'hobby',null,'[시험] 게시판 확인 모임','dev 합성 자료입니다.','/images/groups/music-placeholder.svg','published','2026-10-01')
 on conflict(id) do nothing;

-- Page members. A row on elina carries a marker in answer, so cleanup leaves anyone who joined by themselves.
insert into public.group_memberships(page_id,app_user_id,role,joined_at)
 select pg_temp.fid(3,1),id,case n when 1 then 'owner' when 2 then 'manager' else 'member' end,joined_at from fixture_fans on conflict(page_id,app_user_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,role,joined_at)
 select pg_temp.fid(3,2),id,case n when 1 then 'owner' else 'member' end,joined_at from fixture_fans where n<=12 on conflict(page_id,app_user_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,role,answer,joined_at)
 select r.elina_page,f.id,'member','doc-261107-fixture',f.joined_at from fixture_fans f cross join fixture_ref r where f.n<=9 on conflict(page_id,app_user_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,role,answer,joined_at)
 select r.elina_page,pg_temp.fid(1,121),'member','doc-261107-fixture','2026-10-01' from fixture_ref r on conflict(page_id,app_user_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,role,joined_at)
 select p.page,v.id,'member','2026-10-02' from fixture_viewers v cross join (values(pg_temp.fid(3,1)),(pg_temp.fid(3,2))) p(page) on conflict(page_id,app_user_id) do nothing;
insert into public.group_memberships(page_id,app_user_id,role,answer,joined_at)
 select r.elina_page,v.id,'member','doc-261107-fixture','2026-10-02' from fixture_viewers v cross join fixture_ref r on conflict(page_id,app_user_id) do nothing;

-- The 100-fan condition: read_celebrity_fan_leaderboard counts issued passports, and a passport must name a chain lane.
-- Each gets a stopped job, the same way groups-pencil-dev-bind-identities.sql does it: FAILED, never attempted, and an empty payload, so even a manual retry has no recipient to mint to.
insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)
 values(pg_temp.fid(12,1),pg_temp.fid(2,1),1,'published','2026-10-01') on conflict(id) do nothing;
create temp table fixture_passport_holders(app_user_id uuid primary key,attempt uuid,pass uuid,passport uuid,activity uuid,job uuid,points integer,hearts integer,joined_at timestamptz) on commit drop;
insert into fixture_passport_holders
 select id,pg_temp.fid(13,n),pg_temp.fid(14,n),pg_temp.fid(15,n),pg_temp.fid(16,n),pg_temp.fid(17,n),points,hearts,joined_at from fixture_fans
 union all
 select id,pg_temp.vid('attempt',id),pg_temp.vid('pass',id),pg_temp.vid('passport',id),pg_temp.vid('activity',id),pg_temp.vid('job',id),60,3,timestamptz '2026-10-02 10:00+09' from fixture_viewers;
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
 select attempt,app_user_id,pg_temp.fid(2,1),pg_temp.fid(12,1),1,attempt,'passed',3,joined_at from fixture_passport_holders on conflict(id) do nothing;
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id,passed_at)
 select pass,app_user_id,pg_temp.fid(2,1),attempt,joined_at from fixture_passport_holders on conflict(id) do nothing;
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload,status,last_error_code,last_error_message,created_at,updated_at,next_attempt_at)
 select job,'passport',passport,'doc-261107:passport:'||passport,'{}'::jsonb,'FAILED','DEV_FIXTURE_NO_BROADCAST','Dev fixture only. Do not retry or broadcast.',joined_at,joined_at,joined_at from fixture_passport_holders on conflict(id) do nothing;
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,mint_status,issued_at)
 select passport,app_user_id,pg_temp.fid(2,1),pass,job,'permanent_failure',joined_at from fixture_passport_holders on conflict(id) do nothing;
insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id,occurred_at)
 select activity,app_user_id,pg_temp.fid(2,1),'attendance','doc_261107_fixture',activity,joined_at from fixture_passport_holders on conflict(id) do nothing;
-- Signed-in ranking and policy v2 tiers read this score. The weight check is off, so one row carries the whole value.
insert into public.fan_score_ledger(id,activity_id,app_user_id,celebrity_id,points,created_at)
 select activity,activity,app_user_id,pg_temp.fid(2,1),points,joined_at from fixture_passport_holders on conflict(id) do nothing;
-- Signed-out ranking and policy v3 tiers read hearts. Kept low on purpose: these also count in the creator ranking.
insert into public.creator_heart_ledger(id,celebrity_id,app_user_id,amount,source_type,source_id,created_at)
 select h,pg_temp.fid(2,1),app_user_id,1,'passport_page_claim',h,joined_at
 from fixture_passport_holders cross join lateral generate_series(1,hearts) i cross join lateral (select md5('doc-261107:heart:'||app_user_id::text||':'||i)::uuid h) x
 on conflict(id) do nothing;
insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)
 select 'fan_contribution',pg_temp.fid(2,1),'all','1970-01-01','2026-11-07 00:00+09',jsonb_agg(jsonb_build_object('rank',rn,'subjectId',app_user_id,'score',hearts,'achievedAt',joined_at) order by rn)
 from (select app_user_id,hearts,joined_at,row_number() over(order by hearts desc,joined_at,app_user_id) rn from fixture_passport_holders) x where rn<=100
 on conflict(kind,scope_id,period,period_start) do nothing;

-- Friends: accepted 1-6, incoming 7-8, outgoing 9. No creator scope, so they show on every page both joined.
insert into public.social_friendships(id,requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,created_at,accepted_at)
 select pg_temp.vid('friend:'||n,v.id),case when n<=8 then pg_temp.fid(1,n) else v.id end,case when n<=8 then v.id else pg_temp.fid(1,n) end,null,
  case when n<=6 then 'accepted' else 'pending' end,pg_temp.vid('friend-request:'||n,v.id),'doc-261107-fixture','2026-10-03',case when n<=6 then timestamptz '2026-10-03' end
 from fixture_viewers v cross join generate_series(1,9) n on conflict(id) do nothing;

-- Artist presence [16]. The binding exists from here; whether it shows is set by doc-261107-dev-presence.sql.
insert into public.group_artist_bindings(page_id,app_user_id,verified_by)
 select p.page,pg_temp.fid(1,121),r.admin_id from fixture_ref r cross join lateral (values(r.elina_page),(pg_temp.fid(3,1))) p(page) on conflict(page_id,app_user_id) do nothing;
insert into public.group_artist_presence_settings(app_user_id,enabled) values(pg_temp.fid(1,121),true) on conflict(app_user_id) do nothing;

-- Rooms [31][32]: the three default rooms plus one of each state.
select public.group_ensure_default_rooms(pg_temp.fid(3,1));
insert into public.group_rooms(id,page_id,name,minimum_tier,minimum_stage_key,status,opens_at,closes_at,created_at) values
 (pg_temp.fid(8,1),pg_temp.fid(3,1),'[시험] 지금 열려 있는 방','Bronze','bronze-1','open','2026-11-01 20:00+09',null,'2026-10-05'),
 (pg_temp.fid(8,2),pg_temp.fid(3,1),'[시험] 다음에 열리는 방','Silver','silver-1','scheduled','2027-01-15 20:00+09','2027-01-15 22:00+09','2026-10-05'),
 (pg_temp.fid(8,3),pg_temp.fid(3,1),'[시험] 읽기만 되는 방','Gold','gold-1','readonly','2026-10-10 20:00+09','2026-10-10 22:00+09','2026-10-05'),
 (pg_temp.fid(8,4),pg_temp.fid(3,1),'[시험] 닫힌 방','Bronze','bronze-1','closed','2026-10-01 20:00+09','2026-10-01 22:00+09','2026-09-20'),
 (pg_temp.fid(8,5),pg_temp.fid(3,1),'[시험] 방 이름이 아주 길면 카드에서 어떻게 줄어드는지 확인하는 방입니다','Platinum','platinum-1','scheduled','2027-02-01 20:00+09',null,'2026-10-05')
 on conflict(id) do nothing;
insert into public.group_messages(id,room_id,author_id,body,created_at)
 select pg_temp.fid(9,n),pg_temp.fid(8,1),pg_temp.fid(1,case when n%3=0 then 121 else n end),'[시험] 방 대화 '||n,timestamptz '2026-11-01 20:00+09'+n*interval '2 minutes' from generate_series(1,8) n
 on conflict(id) do nothing;

-- Media [28][29][30]: the runner uploads these repository public files to the same paths first. Keep in step with MEDIA in scripts/seed-doc-261107-dev.mjs.
create temp table fixture_photo(id uuid primary key,owner uuid,post uuid,celebrity uuid,pos smallint,path text,size integer,w integer,h integer,sha text) on commit drop;
insert into fixture_photo select pg_temp.fid(10,x.n),pg_temp.fid(1,x.a),pg_temp.fid(4,x.p),c.id,x.pos,x.path,x.size,x.w,x.h,x.sha from (values
 (1,1,1,1::smallint-1::smallint,'doc-261107/photo-1.webp',96230,1200,900,'c6620f735b195e07f60956997a82061b521b37dda823f010b86eef75eac463a2',true),
 (2,1,1,1::smallint,'doc-261107/photo-2.webp',82422,960,960,'0e396ef1e2d2a88ac9479455ff18d4580367792e212c99a78b518e7eb3f75c6b',true),
 (3,2,2,0::smallint,'doc-261107/photo-3.webp',96230,1200,900,'c6620f735b195e07f60956997a82061b521b37dda823f010b86eef75eac463a2',true),
 (4,121,5,0::smallint,'doc-261107/photo-4.webp',96230,1200,900,'c6620f735b195e07f60956997a82061b521b37dda823f010b86eef75eac463a2',false),
 (5,121,5,1::smallint,'doc-261107/photo-5.webp',82422,960,960,'0e396ef1e2d2a88ac9479455ff18d4580367792e212c99a78b518e7eb3f75c6b',false)
) x(n,a,p,pos,path,size,w,h,sha,test_page) cross join fixture_ref r cross join lateral (select case when x.test_page then pg_temp.fid(2,1) else r.elina_celebrity end id) c;

-- Fan page board (fan_posts). The first body line is the title on screen.
create temp table fixture_posts(n integer primary key,author integer,celebrity uuid,body text,at timestamptz) on commit drop;
insert into fixture_posts select x.n,x.a,case when x.elina then r.elina_celebrity else pg_temp.fid(2,1) end,x.body,x.at from fixture_ref r cross join (values
 (1,1,false,E'[시험] 사진·영상·댓글이 모두 있는 글\n본문 첫 문단입니다. 제목, 날짜, 조회, 추천, 댓글 수가 한 줄로 보이는지 봅니다.\n\n두 번째 문단입니다. 본문이 끝나는 자리와 댓글이 시작하는 자리가 한눈에 갈리는지 봅니다.',timestamptz '2026-11-06 14:02+09'),
 (2,2,false,E'[시험] 사진 한 장 있는 글\n사진이 본문 폭에 맞게 보이는지 봅니다.',timestamptz '2026-11-05 09:30+09'),
 (3,3,false,E'[시험] 제목이 아주 길어서 목록과 상세에서 몇 줄까지 보이고 어디서 잘리는지 확인하는 글입니다\n'||repeat('긴 본문을 확인합니다. 문단이 길어져도 읽는 폭과 줄 간격이 유지되는지 봅니다. ',40),timestamptz '2026-11-04 18:15+09'),
 (4,4,false,E'[시험] 영상 링크가 있는 글\nhttps://www.youtube.com/watch?v=llP16jxxEsU',timestamptz '2026-11-03 12:00+09'),
 (5,121,true,E'[시험] 엘리나 게시판 확인 글\n인증 아티스트 표시와 사진, 영상, 댓글, 답글을 함께 봅니다.',timestamptz '2026-11-06 15:20+09'),
 (6,5,false,E'[시험] 댓글 없는 글\n댓글이 없을 때 구역이 어떻게 보이는지 봅니다.',timestamptz '2026-11-02 08:00+09')
) x(n,a,elina,body,at);
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at,updated_at)
 select pg_temp.fid(4,n),celebrity,pg_temp.fid(1,author),body,pg_temp.fid(4,n),'doc-261107-fixture',false,at,at from fixture_posts on conflict(id) do nothing;
insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,mime_type,byte_size,width,height,sha256,uploaded_at,upload_settled_at,post_id,position,created_at)
 select id,owner,celebrity,path,'image/webp',size,w,h,sha,'2026-11-01','2026-11-01',post,pos,'2026-11-01' from fixture_photo on conflict(id) do nothing;
-- Videos: 1 and 2 on fan_posts 1 and 5, 3 on group post 1. Photos and a video on one post is what the screen must handle; normal save allows one or the other.
insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,request_id,request_hash,width,height,duration_seconds,ready_at,attached_type,attached_id,attached_version,position,access_scope,created_at,updated_at)
 select pg_temp.fid(11,v.n),pg_temp.fid(1,v.a),'video',v.purpose,'video/mp4',571109,571109,'doc-261107/video-'||v.n||'/original.mp4','doc-261107/video-'||v.n||'/thumbnail.webp','ready',pg_temp.fid(11,v.n),'doc-261107-fixture',960,960,5.042,'2026-11-01',v.purpose,v.target,1,v.pos,v.purpose,'2026-11-01','2026-11-01'
 from (values(1,1,'fan_post',pg_temp.fid(4,1),2::smallint),(2,121,'fan_post',pg_temp.fid(4,5),2::smallint),(3,1,'group_post',pg_temp.fid(6,1),1::smallint)) v(n,a,purpose,target,pos)
 on conflict(id) do nothing;
insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,request_id,request_hash,width,height,ready_at,attached_type,attached_id,attached_version,position,access_scope,created_at,updated_at)
 values(pg_temp.fid(11,4),pg_temp.fid(1,1),'image','group_post','image/webp',96230,96230,'doc-261107/photo-6/original.webp','doc-261107/photo-6/thumbnail.webp','ready',pg_temp.fid(11,4),'doc-261107-fixture',1200,900,'2026-11-01','group_post',pg_temp.fid(6,1),1,0,'group_post','2026-11-01','2026-11-01')
 on conflict(id) do nothing;
insert into public.fan_post_likes(post_id,app_user_id,created_at)
 select pg_temp.fid(4,p.n),pg_temp.fid(1,u),'2026-11-06 16:00+09' from (values(1,12),(2,3),(3,1),(4,0),(5,7),(6,0)) p(n,likes) cross join lateral generate_series(10,9+p.likes) u
 on conflict(post_id,app_user_id) do nothing;
insert into public.fan_post_views(post_id,app_user_id,created_at)
 select pg_temp.fid(4,p.n),pg_temp.fid(1,u),'2026-11-06 16:00+09' from (values(1,34),(2,9),(3,5),(4,2),(5,21),(6,1)) p(n,views) cross join lateral generate_series(20,19+p.views) u
 on conflict do nothing;
create temp table fixture_comments(n integer primary key,post integer,author integer,parent integer,body text,at timestamptz) on commit drop;
insert into fixture_comments values
 (1,1,6,null,'[시험] 첫 댓글입니다.','2026-11-06 14:30+09'),
 (2,1,7,1,'[시험] 첫 댓글에 단 답글입니다.','2026-11-06 14:41+09'),
 (3,1,8,1,'[시험] 같은 댓글에 단 두 번째 답글입니다.','2026-11-06 15:03+09'),
 (4,1,9,null,'[시험] 댓글이 아주 길 때 줄바꿈과 답글 들여쓰기가 함께 맞는지 봅니다. '||repeat('길게 이어지는 댓글입니다. ',12),'2026-11-06 16:10+09'),
 (5,1,121,null,'[시험] 인증 아티스트가 쓴 댓글입니다.','2026-11-06 17:00+09'),
 (6,2,10,null,'[시험] 사진 잘 보여요.','2026-11-05 10:00+09'),
 (7,5,6,null,'[시험] 엘리나 게시판 댓글입니다.','2026-11-06 15:40+09'),
 (8,5,121,7,'[시험] 아티스트가 단 답글입니다.','2026-11-06 15:55+09');
insert into public.fan_post_comments(id,post_id,parent_id,app_user_id,body,idempotency_key,created_at,updated_at)
 select pg_temp.fid(5,n),pg_temp.fid(4,post),case when parent is not null then pg_temp.fid(5,parent) end,pg_temp.fid(1,author),body,pg_temp.fid(5,n),at,at from fixture_comments on conflict(id) do nothing;

-- Hobby page board (group_posts).
insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,category,created_at) values
 (pg_temp.fid(6,1),pg_temp.fid(3,2),pg_temp.fid(1,1),'[시험] 사진·영상·댓글이 모두 있는 모임 글',E'본문 첫 문단입니다.\n\n본문이 끝나는 자리와 댓글이 시작하는 자리를 봅니다.','public',false,'free','2026-11-06 14:02+09'),
 (pg_temp.fid(6,2),pg_temp.fid(3,2),pg_temp.fid(1,1),'[시험] 모임 공지','공지 제목이 굵게 보이는지 봅니다.','public',false,'notice','2026-11-05 09:00+09'),
 (pg_temp.fid(6,3),pg_temp.fid(3,2),pg_temp.fid(1,2),'[시험] 멤버만 보는 글','가입한 사람에게만 보입니다.','members',false,'free','2026-11-04 09:00+09')
 on conflict(id) do nothing;
insert into public.group_post_reactions(post_id,app_user_id,created_at) select pg_temp.fid(6,1),pg_temp.fid(1,n),'2026-11-06 16:00+09' from generate_series(2,9) n on conflict(post_id,app_user_id) do nothing;
insert into public.group_post_views(post_id,app_user_id,created_at) select pg_temp.fid(6,1),pg_temp.fid(1,n),'2026-11-06 16:00+09' from generate_series(2,12) n on conflict(post_id,app_user_id) do nothing;
insert into public.group_comments(id,post_id,author_id,body,anonymous,parent_id,created_at) values
 (pg_temp.fid(7,1),pg_temp.fid(6,1),pg_temp.fid(1,3),'[시험] 모임 글 댓글입니다.',false,null,'2026-11-06 14:30+09'),
 (pg_temp.fid(7,2),pg_temp.fid(6,1),pg_temp.fid(1,4),'[시험] 모임 글 답글입니다.',false,pg_temp.fid(7,1),'2026-11-06 14:50+09'),
 (pg_temp.fid(7,3),pg_temp.fid(6,1),pg_temp.fid(1,5),'[시험] 두 번째 댓글입니다.',false,null,'2026-11-06 15:20+09')
 on conflict(id) do nothing;

do $$begin
 if (select count(*) from public.fan_passports where celebrity_id=pg_temp.fid(2,1))<100 then raise exception 'DOC261107_FAN_COUNT';end if;
 if (select count(*) from public.fan_posts where id::text like 'd2611004-%')<>6 then raise exception 'DOC261107_POST_COUNT';end if;
 if (select count(*) from public.social_friendships where payload_hash='doc-261107-fixture')<>9*(select count(*) from fixture_viewers) then raise exception 'DOC261107_FRIEND_COUNT';end if;
 if (select count(*) from public.group_artist_bindings where app_user_id=pg_temp.fid(1,121))<>2 then raise exception 'DOC261107_BINDING_COUNT';end if;
end $$;
select jsonb_build_object('fixture','doc-261107-dev','slug','doc261107-test-ranking','fans',120,'viewers',(select count(*) from fixture_viewers),'fanPostIds',(select jsonb_agg(pg_temp.fid(4,n)) from fixture_posts),'gaugeOn',false) doc261107_seed;
commit;

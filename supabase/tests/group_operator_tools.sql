-- B8 1단계 DB 시험 (plan.md 3판 3.7). Synthetic-only: 일회용 클러스터에서 20261219080000~084000 적용 뒤 실행한다.
-- 동시성·세션 종료·롤백 리허설(Q3·N3 동시·N7·N8a·N8b·N12)은 group_operator_tools_concurrency.sh.
-- 마이그레이션 없이 실행하면 첫 호출에서 실패한다(새 함수·연산 없음).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'OK'; exception when others then return sqlerrm; end $$;
create function pg_temp.gd(p_op text, p_actor uuid, p_page uuid, p_input jsonb default '{}') returns jsonb language sql as $$
  select public.groups_dispatch(p_op, p_actor, p_page, null, p_input, null) $$;
create function pg_temp.expect(p_ok boolean, p_label text, p_detail text default '') returns void language plpgsql as $$
begin if not coalesce(p_ok, false) then raise exception 'FAIL %: %', p_label, p_detail; end if; raise notice 'PASS %', p_label; end $$;
set client_min_messages = notice;

-- 계정: O owner, M manager, A 회원(알림 켬), B 공지 알림 끔, D 일정 알림만 끔, K 작성자를 차단, I 비활성, P 민감 값, C 비회원(북마크만), O2 다른 페이지 owner
insert into public.app_users(id, privy_user_id, verified_email, status) values
 ('b8000000-0000-4000-8000-000000000001','did:privy:b8-owner','b8-owner@example.test','active'),
 ('b8000000-0000-4000-8000-000000000002','did:privy:b8-manager','b8-manager@example.test','active'),
 ('b8000000-0000-4000-8000-000000000003','did:privy:b8-a','b8-a@example.test','active'),
 ('b8000000-0000-4000-8000-000000000004','did:privy:b8-b','b8-b@example.test','active'),
 ('b8000000-0000-4000-8000-000000000005','did:privy:b8-d','b8-d@example.test','active'),
 ('b8000000-0000-4000-8000-000000000006','did:privy:b8-k','b8-k@example.test','active'),
 ('b8000000-0000-4000-8000-000000000007','did:privy:b8-i','b8-i@example.test','active'),
 ('b8000000-0000-4000-8000-000000000008','did:privy:b8-pii','b8-pii@example.test','active'),
 ('b8000000-0000-4000-8000-000000000009','did:privy:b8-c','b8-c@example.test','active'),
 ('b8000000-0000-4000-8000-00000000000a','did:privy:b8-owner2','b8-owner2@example.test','active');
insert into public.user_profiles(app_user_id, nickname, nickname_normalized)
  select id, nick, lower(nick) from (values ('b8000000-0000-4000-8000-000000000001'::uuid,'b8주인'),('b8000000-0000-4000-8000-000000000002'::uuid,'b8매니저'),
   ('b8000000-0000-4000-8000-000000000003'::uuid,'b8에이'),('b8000000-0000-4000-8000-000000000008'::uuid,'연락010')) v(id, nick)
  on conflict (app_user_id) do update set nickname = excluded.nickname;
insert into public.kakao_connection_states(app_user_id, state_hash, code_verifier, return_path, expires_at, purpose)
  values ('b8000000-0000-4000-8000-000000000008', repeat('a',64), repeat('v',43), '/my', now() + interval '5 minutes', 'alimtalk');
insert into public.kakao_phone_enrollments(app_user_id, state_hash, subject_hash, phone, consent_version, consented_at, expires_at)
  values ('b8000000-0000-4000-8000-000000000008', repeat('a',64), repeat('b',64), '01098765432', 'kakao-alimtalk-v1', now(), now() + interval '1 day');

-- 팬페이지(셀럽 공개), 모임 페이지, 다른 페이지, 숨김 페이지
insert into public.celebrities(id, slug, status, image_url, roles, primary_role) values ('b8000000-0000-4000-8000-0000000000c1','b8-fan','draft','/b8.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values
 ('b8000000-0000-4000-8000-0000000000c1','ko','비팔','설명','이미지'),('b8000000-0000-4000-8000-0000000000c1','en','B8','Summary','Image');
update public.celebrities set status = 'published', published_at = clock_timestamp() where id = 'b8000000-0000-4000-8000-0000000000c1';
insert into public.group_pages(id, kind, celebrity_id, name) select 'b8000000-0000-4000-8000-0000000000f1', 'fan', 'b8000000-0000-4000-8000-0000000000c1', '비팔 팬페이지'
  where not exists (select 1 from public.group_pages where celebrity_id = 'b8000000-0000-4000-8000-0000000000c1');
create temp table fx as select
  (select id from public.group_pages where celebrity_id = 'b8000000-0000-4000-8000-0000000000c1') fan,
  'b8000000-0000-4000-8000-0000000000a1'::uuid hobby, 'b8000000-0000-4000-8000-0000000000a2'::uuid other, 'b8000000-0000-4000-8000-0000000000a3'::uuid hidden,
  'b8000000-0000-4000-8000-000000000001'::uuid o, 'b8000000-0000-4000-8000-000000000002'::uuid m, 'b8000000-0000-4000-8000-000000000003'::uuid a,
  'b8000000-0000-4000-8000-000000000004'::uuid b, 'b8000000-0000-4000-8000-000000000005'::uuid d, 'b8000000-0000-4000-8000-000000000006'::uuid k,
  'b8000000-0000-4000-8000-000000000007'::uuid i, 'b8000000-0000-4000-8000-000000000008'::uuid p, 'b8000000-0000-4000-8000-000000000009'::uuid c,
  'b8000000-0000-4000-8000-00000000000a'::uuid o2;
update public.group_pages set listed = true where id = (select fan from fx);
insert into public.group_pages(id, kind, name, status) values
 ('b8000000-0000-4000-8000-0000000000a1','hobby','b8 모임','published'), ('b8000000-0000-4000-8000-0000000000a2','hobby','b8 다른 모임','published'),
 ('b8000000-0000-4000-8000-0000000000a3','hobby','b8 숨김','hidden');
delete from public.group_memberships where page_id in (select fan from fx);
insert into public.group_memberships(page_id, app_user_id, role, answer, joined_at)
  select fx.fan, v.u, v.r, v.ans, now() - v.ago from fx, (values
   ((select o from fx),'owner',null::text, interval '10 days'), ((select m from fx),'manager',null, interval '9 days'),
   ((select a from fx),'member',null, interval '8 days'), ((select b from fx),'member',null, interval '7 days'),
   ((select d from fx),'member',null, interval '6 days'), ((select k from fx),'member',null, interval '5 days'),
   ((select i from fx),'member',null, interval '4 days'),
   ((select p from fx),'member','홍길동입니다 연락은 010-1234-5678, 카톡 abc123, me@example.com, 900101-1234567', interval '3 days')) v(u, r, ans, ago);
insert into public.group_memberships(page_id, app_user_id, role, joined_at) select hobby, o, 'owner', now() from fx;
insert into public.group_memberships(page_id, app_user_id, role, joined_at) select hobby, p, 'member', now() from fx;
insert into public.group_memberships(page_id, app_user_id, role, joined_at) select other, o2, 'owner', now() from fx;
insert into public.group_memberships(page_id, app_user_id, role, joined_at) select hidden, o, 'owner', now() from fx;
insert into public.group_bookmarks(page_id, app_user_id) select fan, c from fx;
update public.app_users set status = 'disabled' where id = (select i from fx);
insert into public.group_notification_settings(page_id, app_user_id, enabled, notice_enabled, event_enabled) select fan, b, true, false, true from fx;
insert into public.group_notification_settings(page_id, app_user_id, enabled, notice_enabled, event_enabled) select fan, d, true, true, false from fx;
insert into public.user_blocks(app_user_id, blocked_app_user_id) select k, o from fx;

-- U1·P1·P5: 목록
do $$
declare f fx; r jsonb; body text; keys text[]; bad text;
begin
  select * into f from fx;
  r := pg_temp.gd('operator-members', f.o, f.fan, '{}');
  body := r::text;
  perform pg_temp.expect((r->>'total')::int = 7 and jsonb_array_length(r->'items') = 7, 'U1 owner 200, total 7 (비활성 제외)', r::text);
  perform pg_temp.expect(pg_temp.gd('operator-members', f.m, f.fan, '{}') ? 'items', 'U1 manager 200');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.a, f.fan)) like 'GROUPS_FORBIDDEN%', 'U1 member 403');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.c, f.fan)) like 'GROUPS_FORBIDDEN%', 'U1 non-member 403');
  perform pg_temp.expect(pg_temp.err(format('select public.groups_dispatch(%L,null,%L)', 'operator-members', f.fan)) like 'GROUPS_FORBIDDEN%', 'U1 no actor 403');
  select array_agg(distinct k order by k) into keys from jsonb_array_elements(r->'items') e, jsonb_object_keys(e) k;
  perform pg_temp.expect(keys = array['avatarUrl','hearts','jjinfan','joinedAt','lastActiveAt','missionCount','nickname','profileId','role'], 'P1 필드 미제공(키 집합 고정)', keys::text);
  foreach bad in array array['홍길동','010-1234-5678','01098765432','abc123','me@example.com','b8-pii@example.test','900101','@example.test'] loop
    perform pg_temp.expect(position(bad in body) = 0, 'P1 값 0건 ' || bad);
  end loop;
  perform pg_temp.expect(position('연락010' in body) > 0, 'P5 공개 닉네임은 그대로');
  perform pg_temp.expect(position('"' || f.i::text in body) = 0, 'U1 비활성 계정 행 없음');
end $$;

-- P2: 기존 members — owner·manager·member 모두 answer 키 없음, 값 0건
do $$
declare f fx; who uuid; r jsonb; bad text;
begin
  select * into f from fx;
  foreach who in array array[f.o, f.m, f.a] loop
    r := pg_temp.gd('members', who, f.fan, '{}');
    perform pg_temp.expect(not exists (select 1 from jsonb_array_elements(r->'items') e where e ? 'answer'), 'P2 members answer 키 없음 ' || who);
    foreach bad in array array['홍길동','010-1234-5678','01098765432','abc123','me@example.com','b8-pii@example.test','900101'] loop
      perform pg_temp.expect(position(bad in r::text) = 0, 'P2 값 0건 ' || bad);
    end loop;
  end loop;
end $$;

-- P3·Q5·U6 준비: 내려받기(owner만, manager 403)
do $$
declare f fx; r jsonb; bad text;
begin
  select * into f from fx;
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members-export', f.m, f.fan)) like 'GROUPS_FORBIDDEN%', 'A3/CSV manager 403(owner 전용)');
  r := pg_temp.gd('operator-members-export', f.o, f.fan, '{}');
  perform pg_temp.expect((r->>'rowCount')::int = jsonb_array_length(r->'items') and (r->>'rowCount')::int = 7 and (r->>'fan')::boolean, 'Q5 rowCount = 데이터 행 수', r->>'rowCount');
  foreach bad in array array['홍길동','010-1234-5678','01098765432','abc123','me@example.com','b8-pii@example.test','900101'] loop
    perform pg_temp.expect(position(bad in r::text) = 0, 'P3 값 0건 ' || bad);
  end loop;
  perform pg_temp.expect((select count(*) from public.group_member_exports where page_id = f.fan) = 1
    and (select count(*) from public.audit_logs where action = 'group_members.export' and entity_id = f.fan::text) = 1, 'P3 내보내기 기록·감사 각 1행');
  -- Q4
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members-export', f.o, f.fan)) = 'GROUPS_RATE_LIMITED', 'Q4 10분 안 두 번째 429');
  perform pg_temp.expect((select count(*) from public.group_member_exports where page_id = f.fan) = 1
    and (select count(*) from public.audit_logs where action = 'group_members.export' and entity_id = f.fan::text) = 1, 'Q4 감사 행 증가 없음');
end $$;

-- P6
do $$ begin perform pg_temp.expect((select answer from public.group_memberships m, fx where m.page_id = fx.fan and m.app_user_id = fx.p)
  = '홍길동입니다 연락은 010-1234-5678, 카톡 abc123, me@example.com, 900101-1234567', 'P6 가입 답변 원문 보존'); end $$;

-- U2·U3: 하트·찐팬, 모임 페이지
do $$
declare f fx; r jsonb; item jsonb;
begin
  select * into f from fx;
  r := pg_temp.gd('operator-members', f.o, f.fan, '{"search":"b8에이"}');
  item := r->'items'->0;
  perform pg_temp.expect((item->>'jjinfan')::boolean = false and (item->>'hearts')::int = 0 and (r->>'jjinfanTotal')::int = 0, 'U2 하트 0 -> false, 0', r::text);
  insert into public.creator_heart_ledger(app_user_id, celebrity_id, source_type, source_id, amount)
    values (f.a, 'b8000000-0000-4000-8000-0000000000c1', 'passport_page_claim', extensions.gen_random_uuid(), 1);
  r := pg_temp.gd('operator-members', f.o, f.fan, '{"search":"b8에이"}');
  item := r->'items'->0;
  perform pg_temp.expect((item->>'jjinfan')::boolean and (item->>'hearts')::int = 1 and (r->>'jjinfanTotal')::int = 1, 'U2 하트 1 -> true, 1, jjinfanTotal 1', r::text);
  r := pg_temp.gd('operator-members', f.o, f.fan, '{"jjinfan":"yes"}');
  perform pg_temp.expect(jsonb_array_length(r->'items') = 1 and r->'items'->0->>'profileId' = f.a::text, 'U2 찐팬 필터 yes');
  r := pg_temp.gd('operator-members', f.o, f.fan, '{"jjinfan":"no"}');
  perform pg_temp.expect(jsonb_array_length(r->'items') = 6, 'U2 찐팬 필터 no');
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at) values (f.m, 'b8000000-0000-4000-8000-0000000000c1', 36, 4, 0, now());
  insert into public.creator_heart_ledger(app_user_id, celebrity_id, source_type, source_id, amount)
    values (f.m, 'b8000000-0000-4000-8000-0000000000c1', 'passport_page_claim', extensions.gen_random_uuid(), 1),
           (f.m, 'b8000000-0000-4000-8000-0000000000c1', 'passport_page_claim', extensions.gen_random_uuid(), 1);
  perform pg_temp.expect(not exists (
      select 1 from jsonb_array_elements(pg_temp.gd('operator-members', f.o, f.fan, '{"limit":50}')->'items') e
      where (e->>'hearts')::int is distinct from public.passport_hearts((e->>'profileId')::uuid, 'b8000000-0000-4000-8000-0000000000c1')),
    'U2 집계 조인 하트 = passport_hearts(원장 + 전환)');
  perform pg_temp.expect((select (e->>'hearts')::int from jsonb_array_elements(pg_temp.gd('operator-members', f.o, f.fan, '{"limit":50}')->'items') e where e->>'profileId' = f.m::text) = 6, 'U2 manager 하트 2+4=6');
  r := pg_temp.gd('operator-members', f.o, f.hobby, '{}');
  perform pg_temp.expect(r->'jjinfanTotal' = 'null'::jsonb and not exists (select 1 from jsonb_array_elements(r->'items') e where e->'hearts' <> 'null'::jsonb or e->'jjinfan' <> 'null'::jsonb), 'U3 모임 페이지 찐팬·하트 null', r::text);
  perform pg_temp.expect(not (pg_temp.gd('operator-members-export', f.o, f.hobby, '{}')->>'fan')::boolean, 'U3 모임 페이지 CSV fan=false');
end $$;

-- Q1: search 17자·제어문자
do $$ declare f fx; begin select * into f from fx;
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L,%L)', 'operator-members', f.o, f.fan, jsonb_build_object('search', repeat('가', 17)))) = 'GROUPS_INVALID_REQUEST', 'Q1 search 17자 400');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L,%L)', 'operator-members', f.o, f.fan, jsonb_build_object('search', 'a' || chr(1)))) = 'GROUPS_INVALID_REQUEST', 'Q1 제어문자 400');
  perform pg_temp.expect(jsonb_array_length(pg_temp.gd('operator-members', f.o, f.fan, '{"limit":51}')->'items') <= 50, 'Q1 SQL limit 상한 50');
end $$;

-- U5: 새 페이지(owner 1명)
do $$ declare f fx; r jsonb; begin select * into f from fx;
  r := pg_temp.gd('operator-members', f.o2, f.other, '{}');
  perform pg_temp.expect((r->>'total')::int = 1 and jsonb_array_length(r->'items') = 1 and r->'items'->0->>'role' = 'owner'
    and (r->'items'->0->>'missionCount')::int = 0 and r->'items'->0->'lastActiveAt' = 'null'::jsonb and r->'items'->0->'hearts' = 'null'::jsonb and r->'nextCursor' = 'null'::jsonb, 'U5 owner 본인 1행', r::text);
  r := pg_temp.gd('operator-members-export', f.o2, f.other, '{}');
  perform pg_temp.expect((r->>'rowCount')::int = 1, 'U5 CSV 1행');
end $$;

-- V1~V4: 페이지 접근 검사
do $$ declare f fx; begin select * into f from fx;
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.o2, f.fan)) like 'GROUPS_FORBIDDEN%', 'V1 다른 페이지 owner 목록 403');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members-export', f.o2, f.fan)) like 'GROUPS_FORBIDDEN%', 'V1 다른 페이지 owner CSV 403');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L)', 'mission-stats', f.o2, f.fan)) like 'GROUPS_FORBIDDEN%', 'V1 다른 페이지 owner 미션 현황 403');
  perform pg_temp.expect(pg_temp.err(format('select public.groups_content_dispatch(%L,%L,%L)', 'notice-broadcast-status', f.o2, f.fan)) like 'GROUPS_FORBIDDEN%', 'V1 다른 페이지 owner 공지 알림 상태 403');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.o, f.hidden)) = 'GROUPS_NOT_FOUND', 'V2 숨김 페이지 404');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L)', 'mission-stats', f.o, f.hidden)) = 'GROUPS_NOT_FOUND', 'V2 숨김 페이지 미션 현황 404');
end $$;
-- V3: 셀럽 비공개 팬페이지. 보관(archived_at)은 운영 명령 전용이라, 같은 판정(status='published' and archived_at is null)의 다른 쪽인 비공개로 본다.
do $$ declare f fx; begin select * into f from fx;
  update public.celebrities set status = 'draft' where id = 'b8000000-0000-4000-8000-0000000000c1';
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.o, f.fan)) = 'GROUPS_NOT_FOUND', 'V3 셀럽 비공개 404');
  raise exception 'V3_UNDO';
exception when others then
  if sqlerrm <> 'V3_UNDO' then raise; end if;
end $$;
-- V4: owner가 비활성(TS 관문 우회, SQL 직접)
do $$ declare f fx; begin select * into f from fx;
  update public.app_users set status = 'disabled' where id = f.o;
  perform pg_temp.expect(public.group_operator_role(f.o, f.fan) is null, 'V4 헬퍼 null');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.o, f.fan)) in ('GROUPS_FORBIDDEN','GROUPS_NOT_FOUND'), 'V4 403/404');
  raise exception 'V4_UNDO';
exception when others then
  if sqlerrm <> 'V4_UNDO' then raise; end if;
end $$;

-- Q2·Q6: 호출량(두 API 한 버킷), 일반 회원은 영향 없음
delete from public.group_operator_read_budgets;
do $$ declare f fx; n integer; r jsonb; begin select * into f from fx;
  -- 기존 members limit=100 -> 50행 이하(회원 60명 추가)
  insert into public.app_users(id, privy_user_id, verified_email, status) select ('b8000000-0000-4000-8001-' || lpad(to_hex(g), 12, '0'))::uuid, 'did:privy:b8-q6-' || g, 'b8-q6-' || g || '@example.test', 'active' from generate_series(1, 60) g;
  insert into public.group_memberships(page_id, app_user_id, joined_at) select f.fan, ('b8000000-0000-4000-8001-' || lpad(to_hex(g), 12, '0'))::uuid, now() from generate_series(1, 60) g;
  for n in 1 .. 15 loop
    perform pg_temp.gd('operator-members', f.m, f.fan, '{}');
    r := pg_temp.gd('members', f.m, f.fan, '{"limit":100}');
  end loop;
  perform pg_temp.expect(jsonb_array_length(r->'items') = 50, 'Q6 운영자 기존 members limit 100 -> 50행', jsonb_array_length(r->'items')::text);
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'members', f.m, f.fan)) = 'GROUPS_RATE_LIMITED', 'Q6 31번째(기존 members) 429');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.m, f.fan)) = 'GROUPS_RATE_LIMITED', 'Q2 31번째(operator-members) 429');
  for n in 1 .. 35 loop r := pg_temp.gd('members', f.a, f.fan, '{"limit":100}'); end loop;
  perform pg_temp.expect(jsonb_array_length(r->'items') > 50, 'Q6 일반 회원 members는 예산·limit 영향 없음', jsonb_array_length(r->'items')::text);
  update public.group_operator_read_budgets set window_start = window_start - interval '1 minute';
  perform pg_temp.expect(pg_temp.gd('operator-members', f.m, f.fan, '{}') ? 'items', 'Q2 다음 창 200');
end $$;
delete from public.group_operator_read_budgets;

-- A1·A2·A4·A5: 권한 위임·회수 감사
do $$ declare f fx; req uuid := 'b8000000-0000-4000-8000-0000000000e1'; n integer; a public.group_role_audit; begin select * into f from fx;
  perform pg_temp.gd('role', f.o, f.fan, jsonb_build_object('appUserId', f.a, 'role', 'manager', 'requestId', req));
  select * into a from public.group_role_audit where target_app_user_id = f.a and page_id = f.fan;
  perform pg_temp.expect(a.actor_app_user_id = f.o and a.before_role = 'member' and a.after_role = 'manager' and a.operation = 'role' and a.request_id = req, 'A1 감사 1행', row_to_json(a)::text);
  perform pg_temp.gd('role', f.o, f.fan, jsonb_build_object('appUserId', f.a, 'role', 'manager', 'requestId', req));
  perform pg_temp.expect((select count(*) from public.group_role_audit where target_app_user_id = f.a) = 1, 'A1 같은 requestId 재시도 감사 추가 없음');
  -- A4: 제약 위반으로 실패한 역할 변경
  n := (select count(*) from public.group_role_audit);
  perform pg_temp.expect(pg_temp.err(format('update public.group_memberships set role = %L where page_id = %L and app_user_id = %L', 'owner', f.fan, f.b)) <> 'OK', 'A4 단일 owner 위반');
  perform pg_temp.expect((select count(*) from public.group_role_audit) = n, 'A4 감사 행 0');
  -- A5
  perform pg_temp.expect(pg_temp.err('update public.group_role_audit set operation = ''system''') like 'GROUP_ROLE_AUDIT_APPEND_ONLY%', 'A5 update 거부');
  perform pg_temp.expect(pg_temp.err('delete from public.group_role_audit') like 'GROUP_ROLE_AUDIT_APPEND_ONLY%', 'A5 delete 거부');
  perform pg_temp.expect(pg_temp.err('truncate public.group_role_audit') like 'GROUP_ROLE_AUDIT_APPEND_ONLY%', 'A5 truncate 거부');
end $$;
-- A2: 이관(owner2 페이지에서 시험 후 되돌리지 않는다), 강제 실패 원자성
do $$ declare f fx; req uuid := 'b8000000-0000-4000-8000-0000000000e2'; n integer; begin select * into f from fx;
  insert into public.group_memberships(page_id, app_user_id) values (f.other, f.a);
  n := (select count(*) from public.group_role_audit);
  begin
    perform pg_temp.gd('transfer', f.o2, f.other, jsonb_build_object('appUserId', f.a, 'requestId', 'b8000000-0000-4000-8000-0000000000e3'));
    perform pg_temp.expect((select count(*) from public.group_role_audit) = n + 2, 'A2 (실패 전) 2행');
    raise exception 'A2_FORCED';
  exception when others then if sqlerrm <> 'A2_FORCED' then raise; end if;
  end;
  perform pg_temp.expect((select count(*) from public.group_role_audit) = n, 'A2 강제 실패 -> 두 행 모두 없음');
  perform pg_temp.gd('transfer', f.o2, f.other, jsonb_build_object('appUserId', f.a, 'requestId', req));
  perform pg_temp.expect((select count(*) from public.group_role_audit where request_id = req) = 2
    and (select count(distinct txid) from public.group_role_audit where request_id = req) = 1
    and exists (select 1 from public.group_role_audit where request_id = req and target_app_user_id = f.o2 and before_role = 'owner' and after_role = 'member' and operation = 'transfer')
    and exists (select 1 from public.group_role_audit where request_id = req and target_app_user_id = f.a and before_role = 'member' and after_role = 'owner' and operation = 'transfer'), 'A2 이관 감사 2행, 같은 request_id·txid');
end $$;

-- M1·M2: 미션 현황 (기간 2026-11-01~2026-11-07 KST)
insert into public.group_missions(id, page_id, title, instructions, state, submission_kind) values
 ('b8000000-0000-4000-8000-0000000000b1', (select fan from fx), 'b8 사진 미션', '올려 주세요', 'published', 'photo'),
 ('b8000000-0000-4000-8000-0000000000b2', (select fan from fx), 'b8 초안', '초안', 'draft', 'text');
insert into public.group_mission_submissions(id, mission_id, app_user_id, body, status, created_at) values
 ('b8000000-0000-4000-8000-0000000000d1','b8000000-0000-4000-8000-0000000000b1',(select b from fx),'x','pending','2026-11-03 10:00+09'),
 ('b8000000-0000-4000-8000-0000000000d2','b8000000-0000-4000-8000-0000000000b1',(select d from fx),'x','completed','2026-11-01 00:00+09'),
 ('b8000000-0000-4000-8000-0000000000d3','b8000000-0000-4000-8000-0000000000b1',(select k from fx),'x','pending','2026-10-31 23:59:59+09');
insert into public.group_mission_submission_revisions(submission_id, revision, body, original_attested, submission_kind, created_at)
  select id, 1, body, false, 'photo', created_at from public.group_mission_submissions where id in ('b8000000-0000-4000-8000-0000000000d1','b8000000-0000-4000-8000-0000000000d2','b8000000-0000-4000-8000-0000000000d3')
  on conflict do nothing;
insert into public.group_mission_submission_reviews(submission_id, revision, action, reason, reviewer_id, request_id, created_at) values
 ('b8000000-0000-4000-8000-0000000000d1', 1, 'reject', '다시', (select o from fx), extensions.gen_random_uuid(), '2026-11-04 12:00+09'),
 ('b8000000-0000-4000-8000-0000000000d2', 1, 'approve', '', (select o from fx), extensions.gen_random_uuid(), '2026-11-07 23:59:59+09'),
 ('b8000000-0000-4000-8000-0000000000d3', 1, 'approve', '', (select o from fx), extensions.gen_random_uuid(), '2026-11-08 00:00+09');
insert into public.group_creator_attendance(app_user_id, celebrity_id, attendance_date, streak, points, request_key, policy_version)
  select u, 'b8000000-0000-4000-8000-0000000000c1', dte, 1, 0, extensions.gen_random_uuid(), 1
  from (values ((select a from fx), date '2026-11-02'), ((select a from fx), date '2026-11-03'), ((select b from fx), date '2026-11-07'),
               ((select c from fx), date '2026-11-03'), ((select d from fx), date '2026-11-08')) v(u, dte);
do $$ declare f fx; r jsonb; item jsonb; begin select * into f from fx;
  r := public.group_activities_dispatch('mission-stats', f.m, f.fan, null, null, '{"from":"2026-11-01","to":"2026-11-07"}');
  perform pg_temp.expect(jsonb_array_length(r->'items') = 1, 'M1 draft 제외', r::text);
  item := r->'items'->0;
  perform pg_temp.expect((item->>'participants')::int = 2 and (item->>'pending')::int = 2 and (item->>'approved')::int = 1 and (item->>'rejected')::int = 1
    and item->>'submissionKind' = 'photo', 'M1 참여 2(경계 00:00 포함·23:59:59 전날 제외), 대기 2, 승인 1(23:59:59 포함·다음날 00:00 제외), 반려 1', item::text);
  -- 반려 후 재제출(같은 행 pending) -> 반려 1 유지, 대기 그대로. 승인 후 대기 감소·승인 증가
  insert into public.group_mission_submission_revisions(submission_id, revision, body, original_attested, submission_kind, created_at)
    values ('b8000000-0000-4000-8000-0000000000d1', 2, 'y', false, 'photo', '2026-11-04 20:00+09') on conflict do nothing;
  update public.group_mission_submissions set status = 'completed', current_revision = 2 where id = 'b8000000-0000-4000-8000-0000000000d1';
  insert into public.group_mission_submission_reviews(submission_id, revision, action, reason, reviewer_id, request_id, created_at)
    values ('b8000000-0000-4000-8000-0000000000d1', 2, 'approve', '', f.o, extensions.gen_random_uuid(), '2026-11-05 09:00+09');
  item := public.group_activities_dispatch('mission-stats', f.m, f.fan, null, null, '{"from":"2026-11-01","to":"2026-11-07"}')->'items'->0;
  perform pg_temp.expect((item->>'pending')::int = 1 and (item->>'approved')::int = 2 and (item->>'rejected')::int = 1, 'M1 승인 후 대기 -1·승인 +1, 반려 유지', item::text);
  perform pg_temp.expect((r->'attendance'->>'participants')::int = 2, 'M2 출석: 기간 안 페이지 회원 고유 2(비회원·기간 밖 제외)', r::text);
  perform pg_temp.expect(public.group_activities_dispatch('mission-stats', f.o, f.hobby, null, null, '{}')->'attendance' = 'null'::jsonb, 'M2 모임 페이지 출석 행 없음');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L,null,null,%L)', 'mission-stats', f.o, f.fan, '{"from":"2026-01-01","to":"2026-11-07"}')) = 'GROUPS_INVALID_REQUEST', 'M 최대 92일');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L)', 'mission-stats', f.b, f.fan)) like 'GROUPS_FORBIDDEN%', 'M 일반 회원 403');
  r := pg_temp.gd('operator-members', f.o, f.fan, jsonb_build_object('search', '연락'));
  perform pg_temp.expect(true, 'M (참고) 목록 호출 정상');
end $$;
do $$ declare f fx; item jsonb; begin select * into f from fx;
  select e into item from jsonb_array_elements(pg_temp.gd('operator-members', f.o, f.fan, '{"limit":50}')->'items') e where e->>'profileId' = f.d::text;
  perform pg_temp.expect((item->>'missionCount')::int = 1, 'U 목록 missionCount = completed 수', item::text);
end $$;

-- 공지 회원 전체 알림
create function pg_temp.notice(p_actor uuid, p_page uuid, p_req uuid, p_notify boolean, p_visibility text default 'members', p_category text default 'notice') returns jsonb language sql as $$
  select public.groups_content_dispatch('post', p_actor, p_page, null, jsonb_build_object('title', 'b8 공지 ' || left(p_req::text, 8), 'body', '본문', 'visibility', p_visibility,
    'category', p_category, 'requestId', p_req, 'notifyMembers', p_notify), null) $$;

-- N10: 스위치 꺼짐 -> 공지는 생기고 방송 행 0, 몫 소진 없음
do $$ declare f fx; r jsonb; begin select * into f from fx;
  r := pg_temp.notice(f.o, f.fan, 'b8000000-0000-4000-8000-0000000000f0', true);
  perform pg_temp.expect(r ? 'id' and (select count(*) from public.group_notice_broadcasts) = 0, 'N10 스위치 꺼짐: 공지 생성, 방송 행 0');
  perform pg_temp.expect((public.groups_content_dispatch('notice-broadcast-status', f.o, f.fan)->>'noticeBroadcastRemainingToday')::int = 1
    and not (public.groups_content_dispatch('notice-broadcast-status', f.o, f.fan)->>'noticeBroadcastEnabled')::boolean, 'N10 몫 그대로, enabled=false');
end $$;
update public.group_notice_broadcast_control set sending_enabled = true;

-- N11: 일반 회원 응답에 남은 횟수 없음
do $$ declare f fx; r jsonb; begin select * into f from fx;
  perform pg_temp.expect(pg_temp.err(format('select public.groups_content_dispatch(%L,%L,%L)', 'notice-broadcast-status', f.b, f.fan)) like 'GROUPS_FORBIDDEN%', 'N11 회원 상태 조회 403');
  r := pg_temp.notice(f.b, f.fan, 'b8000000-0000-4000-8000-0000000000f9', false, 'members', 'free');
  perform pg_temp.expect(r ? 'id' and not r ? 'noticeBroadcastRemainingToday', 'N11 회원 글 응답에 키 없음', r::text);
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.notice(%L,%L,%L,true)', f.b, f.fan, 'b8000000-0000-4000-8000-0000000000f8')) like 'GROUPS_FORBIDDEN%', 'N11 회원 notifyMembers 403');
end $$;

-- A3: manager 회수 직후 같은 세션의 운영 연산 거부
do $$ declare f fx; begin select * into f from fx;
  perform pg_temp.gd('role', f.o, f.fan, jsonb_build_object('appUserId', f.m, 'role', 'member', 'requestId', 'b8000000-0000-4000-8000-0000000000e4'));
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members', f.m, f.fan)) like 'GROUPS_FORBIDDEN%', 'A3 회수 직후 목록 403');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L)', 'mission-stats', f.m, f.fan)) like 'GROUPS_FORBIDDEN%', 'A3 회수 직후 미션 현황 403');
  perform pg_temp.expect(pg_temp.err(format('select public.group_activities_dispatch(%L,%L,%L,%L,%L,%L)', 'mission-review', f.m, f.fan,
    'b8000000-0000-4000-8000-0000000000b1', 'b8000000-0000-4000-8000-0000000000d3', '{"requestId":"b8000000-0000-4000-8000-0000000000e5","action":"approve","reason":""}')) = 'GROUP_ACTIVITY_FORBIDDEN', 'A3 회수 직후 검토(기존 경로, GROUP_ACTIVITY_FORBIDDEN=403)');
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.notice(%L,%L,%L,true)', f.m, f.fan, 'b8000000-0000-4000-8000-0000000000e6')) like 'GROUPS_FORBIDDEN%', 'A3 회수 직후 공지 알림 403');
  perform pg_temp.expect(exists (select 1 from public.group_role_audit where target_app_user_id = f.m and before_role = 'manager' and after_role = 'member' and actor_app_user_id = f.o), 'A3 회수 감사 행');
end $$;

-- N1·N9·U4: 수신자, 앱 푸시 없음, 받은편지함 경로
do $$ declare f fx; r jsonb; post uuid; n integer; begin select * into f from fx;
  r := pg_temp.notice(f.o, f.fan, 'b8000000-0000-4000-8000-0000000000f1', true);
  post := (r->>'id')::uuid;
  perform pg_temp.expect((r->>'noticeBroadcastRemainingToday')::int = 0, 'N3 응답 남은 횟수 0');
  perform pg_temp.expect((select count(*) from public.fan_notifications where source_key = 'group_notice:' || post) = 0
    and (select status from public.group_notice_broadcasts where post_id = post) = 'queued', 'N4 요청 직후 0건·queued');
  perform pg_temp.expect((select count(*) from public.audit_logs where action = 'group_notice.broadcast_queued' and entity_id = post::text) = 1, 'N 예약 감사 1행');
  n := public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect(exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.a), 'N1 A(켬) 1');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.b), 'N1 B(공지 끔) 0');
  perform pg_temp.expect(exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.d), 'N1 D(일정 알림만 끔) 1');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.c), 'N1 비회원 C 0');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.k), 'N1 차단 0');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.o), 'N1 작성자 0');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.i), 'N1 비활성 0');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = f.o2), 'N1 다른 페이지 owner 0');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and not web_only)
    and not exists (select 1 from public.fan_notifications n2 where n2.source_key = 'group_notice:' || post and public.fan_web_notification_can_send(n2.id))
    and not exists (select 1 from public.mobile_push_delivery_outbox x join public.fan_notifications n2 on n2.id = x.notification_id where n2.source_key = 'group_notice:' || post), 'N9 web_only, can_send false, 푸시 준비 0');
  perform pg_temp.expect((select public.fan_web_notification_path(f.a, n2.id) from public.fan_notifications n2 where n2.source_key = 'group_notice:' || post and n2.app_user_id = f.a)
    = '/pages/groups/' || f.fan || '?tab=board&postId=' || post, 'U4 경로 = 공지 상세');
  perform pg_temp.expect(exists (select 1 from jsonb_array_elements(to_jsonb(public.get_owned_web_notifications(f.a, 'ko'))) e where e::text like '%group_notice%'), 'U4 받은편지함이 group_notice를 읽음');
  perform pg_temp.expect((select delivered_count from public.group_notice_broadcasts where post_id = post) = n
    and (select status from public.group_notice_broadcasts where post_id = post) = 'done', 'N 수 정의: delivered_count = 실제 삽입 수', n::text);
  -- N2: members 공개 공지를 받은 뒤 탈퇴 -> 경로 null(모임 페이지 아님: 팬페이지 탈퇴 제한이 없는 시험 계정 D)
  delete from public.group_memberships where page_id = f.fan and app_user_id = f.d;
  perform pg_temp.expect((select public.fan_web_notification_path(f.d, n2.id) from public.fan_notifications n2 where n2.source_key = 'group_notice:' || post and n2.app_user_id = f.d) is null, 'N2 탈퇴 후 경로 null');
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications n2 where n2.source_key = 'group_notice:' || post and not public.group_post_visible(n2.app_user_id, post) and n2.app_user_id <> f.d), 'N2 수신자 전원 볼 수 있음');
end $$;

-- N3: 하루 1회(두 번째 409·글 없음), 같은 requestId 재시도 = 첫 응답, 다음 KST 날 1회
do $$ declare f fx; posts integer; r jsonb; begin select * into f from fx;
  posts := (select count(*) from public.group_posts where page_id = f.fan);
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.notice(%L,%L,%L,true)', f.o, f.fan, 'b8000000-0000-4000-8000-0000000000f2')) = 'GROUPS_RATE_LIMITED:notice_broadcast', 'N3 두 번째 409');
  perform pg_temp.expect((select count(*) from public.group_posts where page_id = f.fan) = posts, 'N3 글도 생기지 않음');
  r := pg_temp.notice(f.o, f.fan, 'b8000000-0000-4000-8000-0000000000f1', true);
  perform pg_temp.expect(r->>'id' = (select post_id::text from public.group_notice_broadcasts where page_id = f.fan) and (select count(*) from public.group_posts where page_id = f.fan) = posts, 'N3 같은 requestId 재시도 = 첫 응답');
  update public.group_notice_broadcasts set kst_date = kst_date - 1 where page_id = f.fan;
  r := pg_temp.notice(f.o, f.fan, 'b8000000-0000-4000-8000-0000000000f3', true);
  perform pg_temp.expect(r ? 'id' and (select count(*) from public.group_notice_broadcasts where page_id = f.fan) = 2, 'N3 다음 KST 날 1회');
  -- N10 진행 중 끔 -> paused, 다시 켜면 이어감
  update public.group_notice_broadcast_control set sending_enabled = false;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect((select status from public.group_notice_broadcasts where post_id = (r->>'id')::uuid) = 'paused', 'N10 진행 중 끔 -> paused');
  update public.group_notice_broadcast_control set sending_enabled = true;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect((select status from public.group_notice_broadcasts where post_id = (r->>'id')::uuid) = 'done', 'N10 다시 켜면 이어서 done');
end $$;

-- N4·N5·N6: 큰 페이지(1,500명). 모임 페이지에 시험 회원을 채운다.
insert into public.app_users(id, privy_user_id, verified_email, status) select ('b8000000-0000-4000-8002-' || lpad(to_hex(g), 12, '0'))::uuid, 'did:privy:b8-n-' || g, 'b8-n-' || g || '@example.test', 'active' from generate_series(1, 1500) g;
insert into public.group_memberships(page_id, app_user_id) select (select hobby from fx), ('b8000000-0000-4000-8002-' || lpad(to_hex(g), 12, '0'))::uuid from generate_series(1, 1500) g;
delete from public.group_memberships where page_id = (select hobby from fx) and app_user_id = (select p from fx);
do $$ declare f fx; r jsonb; post uuid; b public.group_notice_broadcasts; late uuid[]; begin select * into f from fx;
  r := pg_temp.notice(f.o, f.hobby, 'b8000000-0000-4000-8000-0000000000f4', true);
  post := (r->>'id')::uuid;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  select * into b from public.group_notice_broadcasts where post_id = post;
  perform pg_temp.expect(b.status = 'sending' and b.delivered_count = 1000 and b.candidate_count = 1500
    and b.cursor_app_user_id = (select app_user_id from public.group_memberships where page_id = f.hobby and app_user_id <> f.o order by app_user_id offset 999 limit 1), 'N4 1틱 후 1,000·sending, 커서 = 1,000번째', row_to_json(b)::text);
  -- N5: 커서 이후 회원 4명 변화
  select array_agg(app_user_id order by app_user_id) into late from (select app_user_id from public.group_memberships where page_id = f.hobby and app_user_id > b.cursor_app_user_id order by app_user_id limit 4) x;
  delete from public.group_memberships where page_id = f.hobby and app_user_id = late[1];
  update public.app_users set status = 'disabled' where id = late[2];
  insert into public.group_notification_settings(page_id, app_user_id, enabled, notice_enabled) values (f.hobby, late[3], true, false);
  insert into public.user_blocks(app_user_id, blocked_app_user_id) values (late[4], f.o);
  perform public.run_group_notice_broadcasts(2000, 'w2');
  select * into b from public.group_notice_broadcasts where post_id = post;
  perform pg_temp.expect(b.status = 'done' and b.delivered_count = 1496 and b.skipped_count = 2 and b.last_worker = 'w2', 'N4/N5/N8a 2틱 후 done, delivered 1,496, skipped 2, 다른 작업자가 이어감', row_to_json(b)::text);
  perform pg_temp.expect(not exists (select 1 from public.fan_notifications where source_key = 'group_notice:' || post and app_user_id = any(late)), 'N5 네 명 모두 0건');
  perform pg_temp.expect((select count(*) from public.fan_notifications where source_key = 'group_notice:' || post) = 1496
    and (select count(*) = count(distinct app_user_id) from public.fan_notifications where source_key = 'group_notice:' || post), 'N4 중복 0');
end $$;
do $$ declare f fx; r jsonb; post uuid; begin select * into f from fx;
  update public.group_notice_broadcasts set kst_date = kst_date - 1 where page_id = f.hobby;
  r := pg_temp.notice(f.o, f.hobby, 'b8000000-0000-4000-8000-0000000000f5', true);
  post := (r->>'id')::uuid;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform public.groups_content_dispatch('post-remove', f.o, f.hobby, post, '{}');
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect((select status from public.group_notice_broadcasts where post_id = post) = 'cancelled', 'N6 다음 틱 cancelled');
  perform pg_temp.expect((select count(*) from public.fan_notifications where source_key = 'group_notice:' || post) = 1000
    and (select count(*) from public.fan_notifications where source_key = 'group_notice:' || post and superseded_at is not null) = 1000, 'N6 이미 간 1,000건 supersede, 행은 남음');
  perform pg_temp.expect((select public.fan_web_notification_path(n2.app_user_id, n2.id) from public.fan_notifications n2 where n2.source_key = 'group_notice:' || post limit 1) is null, 'N6 받은편지함에서 빠짐(경로 null)');
end $$;

-- 낮음 3: 예약한 manager가 회수되면 남은 발송을 멈춘다
do $$ declare f fx; r jsonb; post uuid; begin select * into f from fx;
  update public.group_notice_broadcasts set kst_date = kst_date - 30 where page_id = f.hobby;
  insert into public.group_memberships(page_id, app_user_id, role) values (f.hobby, f.m, 'manager') on conflict (page_id, app_user_id) do update set role = 'manager';
  r := pg_temp.notice(f.m, f.hobby, 'b8000000-0000-4000-8000-0000000000f6', true);
  post := (r->>'id')::uuid;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect((select status from public.group_notice_broadcasts where post_id = post) = 'sending', '낮음3 회수 전 1틱 sending');
  update public.group_memberships set role = 'member' where page_id = f.hobby and app_user_id = f.m;
  perform public.run_group_notice_broadcasts(2000, 'w1');
  perform pg_temp.expect((select status || ':' || last_error from public.group_notice_broadcasts where post_id = post) = 'cancelled:author_not_operator'
    and (select count(*) from public.fan_notifications where source_key = 'group_notice:' || post) = 1000, '낮음3 회수 뒤 다음 틱 cancelled, 이미 간 1,000건은 그대로');
end $$;

-- 중간 3: 2만 행 초과 CSV는 행 계산 전에 거절, 기록 행 없음
insert into public.group_pages(id, kind, name, status) values ('b8000000-0000-4000-8000-0000000000a6', 'hobby', 'b8 큰 페이지', 'published');
insert into public.app_users(id, privy_user_id, verified_email, status) select ('b8000000-0000-4000-8003-' || lpad(to_hex(g), 12, '0'))::uuid, 'did:privy:b8-big-' || g, 'b8-big-' || g || '@example.test', 'active' from generate_series(1, 20001) g;
insert into public.group_memberships(page_id, app_user_id, role) select 'b8000000-0000-4000-8000-0000000000a6', ('b8000000-0000-4000-8003-' || lpad(to_hex(g), 12, '0'))::uuid, case when g = 1 then 'owner' else 'member' end from generate_series(1, 20001) g;
do $$ declare t0 timestamptz := clock_timestamp(); begin
  perform pg_temp.expect(pg_temp.err(format('select pg_temp.gd(%L,%L,%L)', 'operator-members-export', 'b8000000-0000-4000-8003-000000000001', 'b8000000-0000-4000-8000-0000000000a6')) = 'GROUPS_EXPORT_TOO_LARGE', '중간3 20,001행 CSV 413');
  perform pg_temp.expect((select count(*) from public.group_member_exports where page_id = 'b8000000-0000-4000-8000-0000000000a6') = 0, '중간3 거절은 기록·몫 없음');
  perform pg_temp.expect(clock_timestamp() - t0 < interval '5 seconds', '중간3 행마다의 집계 전에 거절(5초 안)', (clock_timestamp() - t0)::text);
  perform pg_temp.expect(jsonb_array_length(pg_temp.gd('operator-members-export', 'b8000000-0000-4000-8003-000000000001', 'b8000000-0000-4000-8000-0000000000a6', '{"search":"없는닉"}')->'items') = 0, '중간3 거른 결과가 상한 안이면 내보낸다');
end $$;

-- B1·B2·B3·B4: 권한 경계
do $$
declare t text; rl text; fn text;
begin
  foreach t in array array['group_role_audit','group_member_exports','group_operator_read_budgets','group_notice_broadcasts','group_notice_broadcast_control'] loop
    foreach rl in array array['anon','authenticated','service_role'] loop
      perform pg_temp.expect(not has_table_privilege(rl, 'public.' || t, 'select') and not has_table_privilege(rl, 'public.' || t, 'insert')
        and not has_table_privilege(rl, 'public.' || t, 'update') and not has_table_privilege(rl, 'public.' || t, 'delete'), 'B1 ' || rl || ' ' || t);
      perform pg_temp.expect(pg_temp.err(format('set local role %I; select count(*) from public.%I', rl, t)) like 'permission denied%', 'B1 실제 select 거부 ' || rl || ' ' || t);
    end loop;
    perform pg_temp.expect((select relrowsecurity and relforcerowsecurity from pg_class where oid = ('public.' || t)::regclass), 'B1 enable+force RLS ' || t);
  end loop;
  foreach fn in array array['group_operator_role(uuid,uuid)','group_operator_require(uuid,uuid)','group_operator_consume_read(uuid,uuid,text)','group_operator_read_limit()',
      'group_role_audit_capture()','group_operator_members_dispatch(text,uuid,uuid,jsonb)','group_operator_member_rows(uuid,uuid,text,text)','group_mission_stats_read(uuid,uuid,jsonb)','run_group_notice_broadcasts(integer,text)',
      'group_notice_broadcast_batch(uuid,integer,text)','group_notice_broadcast_enabled()','groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)',
      'groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)','group_activities_dispatch_before_mission_stats(text,uuid,uuid,uuid,uuid,jsonb,uuid)'] loop
    foreach rl in array array['anon','authenticated','service_role'] loop
      perform pg_temp.expect(not has_function_privilege(rl, 'public.' || fn, 'execute'), 'B2 ' || rl || ' 실행 불가 ' || fn);
    end loop;
  end loop;
  foreach fn in array array['group_operator_role(uuid,uuid)','group_operator_require(uuid,uuid)','group_operator_consume_read(uuid,uuid,text)','group_role_audit_capture()',
      'group_operator_members_dispatch(text,uuid,uuid,jsonb)','group_operator_member_rows(uuid,uuid,text,text)','group_mission_stats_read(uuid,uuid,jsonb)','run_group_notice_broadcasts(integer,text)','group_notice_broadcast_batch(uuid,integer,text)',
      'group_notice_broadcast_enabled()','groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)',
      'group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','fan_web_notification_path(uuid,uuid)','fan_web_notification_kind(text)',
      'enqueue_due_notification_maintenance(timestamp with time zone)','group_notice_broadcast_post_removed()'] loop
    perform pg_temp.expect((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = ('public.' || fn)::regprocedure), 'B3 definer + search_path 빈 값 ' || fn);
  end loop;
  foreach fn in array array['groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)',
      'fan_web_notification_path(uuid,uuid)','enqueue_due_notification_maintenance(timestamp with time zone)'] loop
    perform pg_temp.expect(has_function_privilege('service_role', 'public.' || fn, 'execute'), 'B4 service_role 진입 함수 실행 ' || fn);
    perform pg_temp.expect(not has_function_privilege('anon', 'public.' || fn, 'execute') and not has_function_privilege('authenticated', 'public.' || fn, 'execute'), 'B4 anon·authenticated 진입 함수 실행 불가 ' || fn);
  end loop;
  -- 마이그레이션 4개에 auth.uid() 0회는 저장소 시험(apps/web contract)에서 본다.
end $$;

-- 유지보수 감싸기가 작업자를 부른다
do $$ begin perform pg_temp.expect(public.enqueue_due_notification_maintenance(now()) ? 'groupNoticeNotifications', 'K 유지보수 결과에 groupNoticeNotifications'); end $$;

select 'GROUP_OPERATOR_TOOLS_SQL_PASS' as result;

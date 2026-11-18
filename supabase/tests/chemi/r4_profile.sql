-- 케미 r4 core·profile_fn 시험(W1-DB-2). 일회용 DB 에서만, 끝에 되돌린다. 모든 마이그레이션이 적용된 DB 가 필요하다.
--  A. F-B12 완료 트랜잭션(R4D 표): false 네 갈래는 케미·요청 상태 불변, true 는 같은 커밋에서 완료+지우기, 지우기 예외는 전부 롤백 뒤 재시도 성공
--  B. 권한: 옛 프로필 RPC 3개 service_role false · v2 true · 내부·트리거 함수 false · 새 표 4개 닫힘
--  C. 상대 고치기·지우기(r4c #18·#19, r4b #11) · 생일 철회(r4b #12·#13 의 M1 꼴) · 0시 정리(#16)
--  D. 트리거: 옛 저장 함수로도 birth_rev 오름(r4b §2.4 #9) · 옛 궁합 쓰기가 장부에 남음(U2) · 제재 계정(restricted)
--  E. 검토 ISSUE 1: 상대를 본 뒤 철회·탈퇴 완료 → 늦게 온 지우기가 소금·상태 줄을 만들지 않음 · SQL 지문 = fingerprint.ts 시험값
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected:%', expected;
exception when others then if sqlerrm = 'expected:' || expected or sqlerrm <> expected then raise; end if; end $$;

-- 그 사용자의 케미 줄과 탈퇴 요청 상태를 한 값으로(전후 비교용)
create function pg_temp.snapshot(u uuid) returns text language plpgsql as $$
declare t record; n bigint; out text := '';
begin
  for t in select c.relname::text tbl, a.attname::text col from pg_class c join pg_namespace s on s.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'chemi\_%' and a.atttypid = 'uuid'::regtype
      and a.attname in ('user_id','user_low','user_high','giver_id','receiver_id','reporter_id') order by 1, 2 loop
    execute format('select count(*) from public.%I where %I = $1', t.tbl, t.col) into n using u;
    out := out || t.tbl || '=' || n || ' ';
  end loop;
  return out || (select row(r.status, r.lease_token, r.lease_until, r.completed_at, r.provider_subject)::text from public.account_deletion_requests r where r.app_user_id = u)
    || (select row(x.status, x.privy_user_id, x.verified_email)::text from public.app_users x where x.id = u)
    || (select count(*)::text from public.account_subject_tombstones where app_user_id = u);
end $$;

create function pg_temp.seed(u uuid) returns void language plpgsql as $$
declare r uuid := extensions.gen_random_uuid(); d date := public.dukjil_kst_date();
begin
  insert into public.chemi_profiles (user_id, birth_date, calendar, time_precision, consent_version, consent_at) values (u, '1995-05-05', 'solar', 'unknown', 'v1', now());
  insert into public.chemi_readings (id, user_id, content, kind, character, kst_date, result, engine_version, table_version)
    values (r, u, 'fortune', 'daily', 'changha', d, '{}', 'e', 't');
  insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id) values (u, d, 'open:fortune', 1, 'daily:' || d, r);
  insert into public.chemi_charms (user_id, kind, kst_date, character, design_code, reading_id) values (u, 'card', d, 'changha', 'c1', r);
  insert into public.chemi_reports (reporter_id, target_kind, target_id, reason) values (u, 'reading_line', r, 'other');
  perform public.chemi_pass_ensure_initial(u);
end $$;

-- 탈퇴 시작 → claim 까지 한 사용자(subject 는 privy). 돌려주는 값은 lease 토큰.
create function pg_temp.started(u uuid, subject text) returns uuid language plpgsql as $$
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (u, subject, replace(subject, ':', '-') || '@example.test');
  perform pg_temp.seed(u);
  perform public.chemi_begin_account_deletion(subject);
  return (public.claim_account_deletion(u) ->> 'leaseToken')::uuid;
end $$;

-- A ------------------------------------------------------------------------------------------------
do $$
declare u uuid; tok uuid; before text; other uuid := extensions.gen_random_uuid(); c text; failed boolean := false;
  keep constant text[] := array['chemi_orders','chemi_pay_eligibility','chemi_first_purchase','chemi_guardian_consents'];
begin
  -- 탭·묶음 스위치는 전부 off(탈퇴는 보지 않는다)
  perform public.chemi_switch_set('feature', k, 'off') from unnest(array['pay','ask','chain','game','grow','friends']) k;

  -- A1 만료 토큰
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a1-expired');
  update public.account_deletion_requests set lease_until = pg_catalog.clock_timestamp() - interval '1 second' where app_user_id = u;
  before := pg_temp.snapshot(u);
  if public.chemi_complete_account_deletion(u, tok) then raise exception 'A1 expired token returned true'; end if;
  if pg_temp.snapshot(u) <> before then raise exception 'A1 state changed % → %', before, pg_temp.snapshot(u); end if;

  -- A2 다른 워커가 다시 가져간 토큰(옛 토큰으로 완료 시도)
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a2-reclaimed');
  update public.account_deletion_requests set lease_token = other where app_user_id = u;
  before := pg_temp.snapshot(u);
  if public.chemi_complete_account_deletion(u, tok) then raise exception 'A2 stale token returned true'; end if;
  if pg_temp.snapshot(u) <> before then raise exception 'A2 state changed'; end if;

  -- A3 저장소 미완료
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a3-storage');
  insert into public.account_deletion_objects (app_user_id, bucket, object_path) values (u, 'fan-avatars', u || '/a.webp');
  before := pg_temp.snapshot(u);
  if public.chemi_complete_account_deletion(u, tok) then raise exception 'A3 storage pending returned true'; end if;
  if pg_temp.snapshot(u) <> before then raise exception 'A3 state changed'; end if;

  -- A4 이메일 provider 미완료
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a4-provider');
  update public.account_deletion_requests set supabase_user_id = extensions.gen_random_uuid(), supabase_deleted = false where app_user_id = u;
  before := pg_temp.snapshot(u);
  if public.chemi_complete_account_deletion(u, tok) then raise exception 'A4 provider pending returned true'; end if;
  if pg_temp.snapshot(u) <> before then raise exception 'A4 state changed'; end if;
  -- provider 를 끝내면 같은 lease 로 완료된다
  update public.account_deletion_requests set supabase_deleted = true, privy_deleted = true where app_user_id = u;
  if not public.chemi_complete_account_deletion(u, tok) then raise exception 'A4 complete after provider'; end if;

  -- A5 유효 완료, 탭 off, 케미 사용 회원: true 와 completed 가 같은 트랜잭션, 보관 표 밖 케미 줄 0
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a5-valid');
  if not public.chemi_complete_account_deletion(u, tok) then raise exception 'A5 returned false'; end if;
  if (select status from public.account_deletion_requests where app_user_id = u) <> 'completed' then raise exception 'A5 not completed'; end if;
  c := pg_temp.snapshot(u);
  if c !~ 'chemi_daily_uses=0 ' or c !~ 'chemi_charms=0 ' or c !~ 'chemi_reports=0 ' or c !~ 'chemi_readings=0 ' or c !~ 'chemi_profiles=0 '
    or c !~ 'chemi_pass_lots=0 ' or c !~ 'chemi_user_state=0 ' then raise exception 'A5 rows left %', c; end if;

  -- A6 erase 중 강제 예외: 완료 영수증·묘비·scrub·케미 줄 모두 롤백, 같은 lease 로 재시도 성공
  u := extensions.gen_random_uuid(); tok := pg_temp.started(u, 'did:privy:r4-a6-boom');
  before := pg_temp.snapshot(u);
  create function pg_temp.boom() returns trigger language plpgsql as $f$ begin raise exception 'ERASE_BOOM'; end $f$;
  create trigger chemi_test_boom before delete on public.chemi_daily_uses for each row execute function pg_temp.boom();
  begin
    perform public.chemi_complete_account_deletion(u, tok);
  exception when others then
    if sqlerrm <> 'ERASE_BOOM' then raise; end if;
    failed := true;
  end;
  drop trigger chemi_test_boom on public.chemi_daily_uses;
  if not failed then raise exception 'A6 exception swallowed'; end if;
  if pg_temp.snapshot(u) <> before then raise exception 'A6 not rolled back % → %', before, pg_temp.snapshot(u); end if;
  if not public.chemi_complete_account_deletion(u, tok) then raise exception 'A6 retry failed'; end if;
  if pg_temp.snapshot(u) !~ 'chemi_daily_uses=0 ' then raise exception 'A6 retry left rows'; end if;

  -- A7 케미 줄 없는 회원: 감싸개와 기존 함수의 시작 응답·완료·묘비가 같다(Q2 조건 ③)
  declare a uuid := extensions.gen_random_uuid(); b uuid := extensions.gen_random_uuid(); ra jsonb; rb jsonb; ta uuid; tb uuid;
  begin
    insert into public.app_users (id, privy_user_id, verified_email) values (a, 'did:privy:r4-a7-plain-a', 'r4a7a@example.test'), (b, 'did:privy:r4-a7-plain-b', 'r4a7b@example.test');
    ra := public.begin_owned_account_deletion('did:privy:r4-a7-plain-a');
    rb := public.chemi_begin_account_deletion('did:privy:r4-a7-plain-b');
    if ra - 'appUserId' <> rb - 'appUserId' then raise exception 'A7 begin % vs %', ra, rb; end if;
    ta := (public.claim_account_deletion(a) ->> 'leaseToken')::uuid; tb := (public.claim_account_deletion(b) ->> 'leaseToken')::uuid;
    if public.complete_account_deletion(a, ta) is distinct from public.chemi_complete_account_deletion(b, tb) then raise exception 'A7 complete differs'; end if;
    if regexp_replace(replace(pg_temp.snapshot(a), a::text, 'X'), '"[^"]*"|\([^)]*\)', '', 'g')
      <> regexp_replace(replace(pg_temp.snapshot(b), b::text, 'X'), '"[^"]*"|\([^)]*\)', '', 'g') then
      raise exception 'A7 end state % vs %', pg_temp.snapshot(a), pg_temp.snapshot(b); end if;
    if (select count(*) from public.account_subject_tombstones where app_user_id in (a, b)) <> 2 then raise exception 'A7 tombstones'; end if;
    if pg_temp.snapshot(b) !~ '^(chemi_[a-z_]+=0 )+' or pg_temp.snapshot(b) ~ '=[1-9]' then raise exception 'A7 chemi writes %', pg_temp.snapshot(b); end if;
  end;
end $$;

-- B ------------------------------------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p where p.pronamespace = 'public'::regnamespace
    and (p.proname in ('chemi_save_birth','chemi_add_partner','chemi_delete_partner') or p.oid = 'public.chemi_delete_partner_v2(uuid,uuid,text)'::regprocedure)
    and has_function_privilege('service_role', p.oid, 'execute');
  if bad is not null then raise exception 'B old profile RPC still executable: %', bad; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('chemi_save_birth_v2','chemi_add_partner_v2','chemi_update_partner_v2','chemi_delete_partner_v3','chemi_purge_ephemeral',
      'chemi_fp_salt','chemi_begin_account_deletion','chemi_complete_account_deletion','chemi_withdraw_birth_consent','chemi_read_profile')
    and not has_function_privilege('service_role', p.oid, 'execute');
  if bad is not null then raise exception 'B route RPC not executable: %', bad; end if;
  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('chemi_assert_unrestricted','chemi_erase_partner_rows','chemi_partner_fp','chemi_profile_rev_trg','chemi_partner_rev_trg','chemi_readings_legacy_use_trg',
      'chemi_erase_user','chemi_release_user_holds')
    and (has_function_privilege('service_role', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));
  if bad is not null then raise exception 'B internal function executable: %', bad; end if;
  select string_agg(c.relname, ', ') into bad from pg_class c where c.relnamespace = 'public'::regnamespace
    and c.relname in ('chemi_daily_uses','chemi_star_cuts','chemi_charms','chemi_reports')
    and (not c.relrowsecurity or exists (select 1 from pg_policy where polrelid = c.oid)
      or has_table_privilege('service_role', c.oid, 'select,insert,update,delete') or has_table_privilege('anon', c.oid, 'select')
      or has_table_privilege('authenticated', c.oid, 'select'));
  if bad is not null then raise exception 'B new table open: %', bad; end if;
  if has_sequence_privilege('service_role', 'public.chemi_input_rev_seq', 'usage') then raise exception 'B sequence open'; end if;
end $$;

-- C ------------------------------------------------------------------------------------------------
do $$
declare u uuid := extensions.gen_random_uuid(); p uuid; q uuid; d date := public.dukjil_kst_date(); rev0 bigint; res jsonb; salt text;
  fp1 text := 'fp:' || repeat('a', 32); fp2 text := 'fp:' || repeat('b', 32); fpq text := 'fp:' || repeat('c', 32); t uuid; f uuid;
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (u, 'did:privy:r4-c', 'r4c@example.test');
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', 'female', '서울', 'kr:11', 37.5665, 126.9780, 'Asia/Seoul', null, 'v1');
  if (select (birth_place_code, birth_tz, birth_place) from public.chemi_profiles where user_id = u) is distinct from ('kr:11'::text, 'Asia/Seoul'::text, '서울'::text) then
    raise exception 'C save_birth_v2 place'; end if;
  p := (public.chemi_add_partner_v2(u, '민지', '1997-03-12', 'solar', null, 'unknown', null, 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  q := (public.chemi_add_partner_v2(u, '하나', '1998-01-01', 'solar', null, 'unknown', null, 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  salt := public.chemi_fp_salt(u);
  if salt !~ '^[0-9a-f]{64}$' or public.chemi_fp_salt(u) <> salt then raise exception 'C salt not stable'; end if;

  -- 오늘 p 와 궁합(v2 꼴: 지문 열쇠, opened_by free) + 장부 1줄, 옛 열쇠 줄(어제) 1개, 공유 카드
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by)
    values (u, 'saju', 'compat', 'changha', d, fp1, '{}', 'e', 't', 'free') returning id into t;
  insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id) values (u, d, 'compat_free', 1, 'compat:' || fp1, t);
  insert into public.chemi_share_cards (id, user_id, content, character, reading_id, card, expires_at) values ('r4share0001', u, 'saju', 'changha', t, '{}', now() + interval '1 day');
  update public.chemi_partners set compat_first_date = d - 1 where id = p;

  -- #18 장소만 고침: 지문 같음 → 궁합 줄·장부·compat_first_date 그대로, rev 만 오름
  select rev into rev0 from public.chemi_partners where id = p;
  res := public.chemi_update_partner_v2(u, p, '민지', '1997-03-12', 'solar', null, 'unknown', null, 'kr:26', 35.1796, 129.0756, 'Asia/Seoul', fp1, fp1);
  if (res ->> 'rev')::bigint <= rev0 or (res ->> 'erased')::int <> 0 or not exists (select 1 from public.chemi_readings where id = t)
    or (select item_key from public.chemi_daily_uses where user_id = u and bucket = 'compat_free') <> 'compat:' || fp1
    or (select compat_first_date from public.chemi_partners where id = p) <> d - 1 then raise exception '#18 %', res; end if;
  -- 별명만 고치면 rev 도 그대로
  select rev into rev0 from public.chemi_partners where id = p;
  res := public.chemi_update_partner_v2(u, p, '민지2', '1997-03-12', 'solar', null, 'unknown', null, 'kr:26', 35.1796, 129.0756, 'Asia/Seoul', fp1, fp1);
  if (res ->> 'rev')::bigint <> rev0 then raise exception 'nickname-only edit raised rev'; end if;

  -- #19 생일 고침: 옛 지문 줄 0, 공유 카드 0, 장부 erased:1(줄은 남음), compat_first_date null
  res := public.chemi_update_partner_v2(u, p, '민지2', '1997-03-13', 'solar', null, 'unknown', null, 'kr:26', 35.1796, 129.0756, 'Asia/Seoul', fp1, fp2);
  if exists (select 1 from public.chemi_readings where id = t) or exists (select 1 from public.chemi_share_cards where id = 'r4share0001')
    or (select (item_key, reading_id) from public.chemi_daily_uses where user_id = u and bucket = 'compat_free') is distinct from ('erased:1'::text, null::uuid)
    or (select compat_first_date from public.chemi_partners where id = p) is not null then raise exception '#19 %', res; end if;

  -- #11 지우기 v2: 옛 열쇠 줄(target_key = 상대 번호, 옛 함수로 씀 → 트리거가 legacy 장부) + 지문 줄을 함께 지운다
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version)
    values (u, 'star', 'compat', 'changha', d - 1, q::text, '{}', 'e', 't') returning id into f;
  if (select item_key from public.chemi_daily_uses where user_id = u and kst_date = d - 1 and bucket = 'compat_free') <> 'legacy:' || f then
    raise exception 'U2 legacy ledger row missing'; end if;
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by)
    values (u, 'saju', 'compat', 'changha', d - 1, fpq, '{}', 'e', 't', 'quota');
  if not (public.chemi_delete_partner_v2(u, q, fpq) ->> 'deleted')::boolean then raise exception '#11 not deleted'; end if;
  if exists (select 1 from public.chemi_readings where user_id = u and target_key in (q::text, fpq))
    or (select item_key from public.chemi_daily_uses where user_id = u and kst_date = d - 1 and bucket = 'compat_free') <> 'erased:1'
    or exists (select 1 from public.chemi_partners where id = q) then raise exception '#11 rows left'; end if;
  if (public.chemi_delete_partner_v2(u, q, fpq) ->> 'deleted')::boolean then raise exception '#11 second delete true'; end if;
  perform pg_temp.expect_error(format('select public.chemi_delete_partner_v2(%L, %L, %L)', u, p, 'p-1'), 'CHEMI_INVALID');

  -- #12·#13(M1 꼴) 생일 철회: 장부 줄은 남고 생일 칸 참조만 지움, open:tarot·타로 풀이는 그대로, fp_salt null, 지운 풀이의 부적 삭제
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, result, engine_version, table_version, opened_by)
    values (u, 'tarot', 'tarot3', 'elina', d, '{}', 'e', 't', 'open') returning id into t;
  insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id) values (u, d, 'open:tarot', 1, 'tarot3:', t);
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by)
    values (u, 'saju', 'topic', 'yuna', d, 'love', '{}', 'e', 't', 'open') returning id into f;
  insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id) values (u, d, 'open:saju', 1, 'topic:love', f);
  insert into public.chemi_charms (user_id, kind, kst_date, character, design_code, reading_id) values (u, 'card', d, 'yuna', 'c1', f);
  insert into public.chemi_charms (user_id, kind, kst_date, character, design_code, reading_id) values (u, 'special', d, 'elina', 's1', t);
  res := public.chemi_withdraw_birth_consent(u);
  if (select count(*) from public.chemi_daily_uses where user_id = u) <> 4 then raise exception '#12 ledger rows removed'; end if;
  if exists (select 1 from public.chemi_daily_uses where user_id = u and bucket <> 'open:tarot' and (item_key not like 'erased:%' or reading_id is not null)) then
    raise exception '#12 ledger refs kept'; end if;
  if (select (item_key, reading_id) from public.chemi_daily_uses where user_id = u and bucket = 'open:tarot') is distinct from ('tarot3:'::text, t)
    or not exists (select 1 from public.chemi_readings where id = t) then raise exception '#13 tarot touched'; end if;
  if exists (select 1 from public.chemi_readings where user_id = u and content <> 'tarot') or exists (select 1 from public.chemi_profiles where user_id = u)
    or exists (select 1 from public.chemi_partners where user_id = u) then raise exception '#12 birth data kept'; end if;
  if (select fp_salt from public.chemi_user_state where user_id = u) is not null then raise exception '#12 fp_salt kept'; end if;
  if (select string_agg(kind, ',') from public.chemi_charms where user_id = u) <> 'special' then raise exception '#12 charms'; end if;
  if (select count(*) from public.chemi_daily_uses where user_id = u and item_key ~ 'fp:|love') > 0 then raise exception '#12 fingerprint text left'; end if;
  -- 생일이 없으면 소금을 만들지 않는다(ISSUE 1). 다시 등록하면 새 소금
  if public.chemi_fp_salt(u) is not null or (select fp_salt from public.chemi_user_state where user_id = u) is not null then
    raise exception '#12 salt recreated without birth consent'; end if;
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, null, null, null, null, null, 'v1');
  if public.chemi_fp_salt(u) = salt then raise exception '#12 salt reused'; end if;

  -- #16 0시 정리: purge_after ≤ 오늘 풀이 삭제 + 장부 참조 지움, 그제 이전 장부 줄 삭제, 어제·오늘은 유지
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by, purge_after)
    values (u, 'saju', 'compat', 'changha', d, 'fp:' || repeat('d', 32), '{}', 'e', 't', 'free', d) returning id into f;
  insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id) values (u, d, 'friend_free', 1, 'friend_today:x', f),
    (u, d - 2, 'compat_free', 1, 'erased:1', null);
  res := public.chemi_purge_ephemeral(d);
  if exists (select 1 from public.chemi_readings where id = f) or exists (select 1 from public.chemi_daily_uses where user_id = u and kst_date < d - 1)
    or (select item_key from public.chemi_daily_uses where user_id = u and bucket = 'friend_free' and kst_date = d) <> 'erased:1'
    or not exists (select 1 from public.chemi_daily_uses where user_id = u and kst_date = d - 1) then raise exception '#16 %', res; end if;
end $$;

-- D ------------------------------------------------------------------------------------------------
do $$
declare u uuid := extensions.gen_random_uuid(); r0 bigint; r1 bigint; p uuid;
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (u, 'did:privy:r4-d', 'r4d@example.test');
  -- §2.4 #9 옛 저장 함수로 생일을 바꿔도 birth_rev 가 오른다(트리거)
  perform public.chemi_save_birth(u, '1995-05-05', 'solar', null, 'unknown', null, null, 'v1');
  select birth_rev into r0 from public.chemi_profiles where user_id = u;
  update public.chemi_profiles set edited_at = null where user_id = u;
  perform public.chemi_save_birth(u, '1995-05-06', 'solar', null, 'unknown', null, null, 'v1');
  select birth_rev into r1 from public.chemi_profiles where user_id = u;
  if r1 <= r0 then raise exception '#9 birth_rev % → %', r0, r1; end if;
  update public.chemi_profiles set consent_version = 'v2' where user_id = u;
  if (select birth_rev from public.chemi_profiles where user_id = u) <> r1 then raise exception '#9 non-input edit raised rev'; end if;
  -- 옛 함수 궁합 쓰기가 장부에 legacy 줄로(U2)
  p := (public.chemi_add_partner(u, '민지', '1997-03-12', 'solar', null, 'unknown', null, 'saju') ->> 'partnerId')::uuid;
  perform public.chemi_complete_reading(u, 'saju', 'compat', 'changha', null, p::text, '{}', 'e', 't');
  if (select item_key from public.chemi_daily_uses where user_id = u and bucket = 'compat_free' and kst_date = public.dukjil_kst_date()) not like 'legacy:%' then
    raise exception 'U2 old compat not in ledger'; end if;
  -- 옛 함수는 v2 판 장부 줄도 본다(줄을 센다): 다른 상대는 CHEMI_PAYMENT_REQUIRED
  perform pg_temp.expect_error(format('select public.chemi_complete_reading(%L,%L,%L,%L,null,%L,%L,%L,%L)', u, 'saju', 'compat', 'changha', 'other', '{}', 'e', 't'),
    'CHEMI_PAYMENT_REQUIRED');

  -- restricted(r4b §18): 제재 줄이 있으면 저장 v2 거절·줄 0, 지우기·철회·읽기는 됨, 풀면 다시 됨.
  -- 제재 줄의 신고·관리자 FK 는 이 시험과 무관해 그 한 줄만 FK 트리거를 끄고 넣는다.
  set local session_replication_role = replica;
  insert into public.app_user_moderation_restrictions (app_user_id, report_id, reason, actor_admin_id)
    values (u, extensions.gen_random_uuid(), 'r4 restricted fixture', extensions.gen_random_uuid());
  set local session_replication_role = origin;
  perform pg_temp.expect_error(format('select public.chemi_save_birth_v2(%L,%L,%L,null,%L,null,null,null,null,null,null,null,%L)', u, '1995-05-07', 'solar', 'unknown', 'v1'),
    'CHEMI_ACCOUNT_RESTRICTED');
  perform pg_temp.expect_error(format('select public.chemi_add_partner_v2(%L,%L,%L,%L,null,%L,null,%L,null,null,null,null)', u, 'x', '1990-01-01', 'solar', 'unknown', 'saju'),
    'CHEMI_ACCOUNT_RESTRICTED');
  if (select count(*) from public.chemi_partners where user_id = u) <> 1 then raise exception 'restricted wrote a partner'; end if;
  perform public.chemi_read_profile(u);
  if not (public.chemi_delete_partner_v2(u, p, 'fp:' || repeat('e', 32)) ->> 'deleted')::boolean then raise exception 'restricted delete'; end if;
  perform public.chemi_withdraw_birth_consent(u);
  set local session_replication_role = replica;
  update public.app_user_moderation_restrictions set revoked_at = now() where app_user_id = u;
  set local session_replication_role = origin;
  perform public.chemi_save_birth_v2(u, '1995-05-07', 'solar', null, 'unknown', null, null, null, null, null, null, null, 'v1');
end $$;
-- E ------------------------------------------------------------------------------------------------
do $$
declare u uuid := extensions.gen_random_uuid(); p uuid; tok uuid; s1 bytea := decode(repeat('01', 32), 'hex'); fp text; t uuid; res jsonb;
begin
  -- E3 지문 시험값(apps/web/server/chemi-profile/handlers.test.ts 와 같은 값)
  if public.chemi_partner_fp(s1, '1997-03-12', 'solar', '08:10', 'band', 'male') <> 'fp:6c0a293e0166149e48d52762d2329597'
    or public.chemi_partner_fp(s1, '1998-01-01', 'lunar', null, 'unknown', null) <> 'fp:ecfdf362a75372e01193b9a402893946' then
    raise exception 'E3 SQL fingerprint differs from fingerprint.ts'; end if;

  -- E3 v3 는 저장된 입력과 이미 있는 소금으로 지문 줄을 찾아 지운다
  insert into public.app_users (id, privy_user_id, verified_email) values (u, 'did:privy:r4-e', 'r4e@example.test');
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, null, null, null, null, null, 'v1');
  p := (public.chemi_add_partner_v2(u, '민지', '1997-03-12', 'solar', '08:10', 'band', 'male', 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  fp := 'fp:' || left(encode(extensions.hmac(convert_to('1997-03-12|solar|08:10|band|male', 'UTF8'), decode(public.chemi_fp_salt(u), 'hex'), 'sha256'), 'hex'), 32);
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by)
    values (u, 'saju', 'compat', 'changha', public.dukjil_kst_date(), fp, '{}', 'e', 't', 'free') returning id into t;
  res := public.chemi_delete_partner_v3(u, p);
  if not (res ->> 'deleted')::boolean or exists (select 1 from public.chemi_readings where id = t) then
    raise exception 'E3 v3 did not erase the fingerprint row: % %', res, (select target_key from public.chemi_readings where id = t); end if;
  if (public.chemi_delete_partner_v3(u, p) ->> 'deleted')::boolean then raise exception 'E3 second delete true'; end if;

  -- E1 상대를 본 뒤(조회) 생일 철회가 먼저 끝나고 늦게 온 지우기: false, 소금 null 유지, 상태 줄 그대로
  p := (public.chemi_add_partner_v2(u, '하나', '1998-01-01', 'lunar', null, 'unknown', null, 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  perform public.chemi_read_profile(u);
  perform public.chemi_withdraw_birth_consent(u);
  if (public.chemi_delete_partner_v3(u, p) ->> 'deleted')::boolean then raise exception 'E1 delete after withdrawal true'; end if;
  if public.chemi_fp_salt(u) is not null or (select fp_salt from public.chemi_user_state where user_id = u) is not null then
    raise exception 'E1 salt recreated after withdrawal'; end if;

  -- E2 상대를 본 뒤 탈퇴 완료(묘비): 늦게 온 지우기·소금 요청 모두 CHEMI_ACCOUNT_CLOSED, chemi_user_state 0
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, null, null, null, null, null, 'v1');
  p := (public.chemi_add_partner_v2(u, '셋', '1998-01-01', 'lunar', null, 'unknown', null, 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  perform public.chemi_fp_salt(u);
  perform public.chemi_read_profile(u);
  perform public.chemi_begin_account_deletion('did:privy:r4-e');
  tok := (public.claim_account_deletion(u) ->> 'leaseToken')::uuid;
  if not public.chemi_complete_account_deletion(u, tok) then raise exception 'E2 deletion not completed'; end if;
  perform pg_temp.expect_error(format('select public.chemi_delete_partner_v3(%L, %L)', u, p), 'CHEMI_ACCOUNT_CLOSED');
  perform pg_temp.expect_error(format('select public.chemi_fp_salt(%L)', u), 'CHEMI_ACCOUNT_CLOSED');
  if exists (select 1 from public.chemi_user_state where user_id = u) or exists (select 1 from public.chemi_partners where user_id = u)
    or exists (select 1 from public.chemi_profiles where user_id = u) then raise exception 'E2 chemi state recreated after deletion'; end if;
end $$;
select 'r4_profile ok' as result;
rollback;

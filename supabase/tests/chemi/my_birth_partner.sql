-- chemi_update_partner_v3 · chemi_my_birth_summary (MY 생일 정보). 일회용 DB 에서 돌리고 마지막에 ROLLBACK.
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'expected:%', expected;
exception when others then if sqlerrm = 'expected:' || expected or sqlerrm <> expected then raise; end if; end $$;
do $$
declare u uuid := extensions.gen_random_uuid(); p uuid; salt text; fp text; t uuid; res jsonb; s jsonb; other uuid := extensions.gen_random_uuid();
begin
  insert into public.app_users (id, privy_user_id, verified_email) values (u, 'did:privy:my-' || u, u || '@example.test'), (other, 'did:privy:my-' || other, other || '@example.test');
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, null, null, null, null, null, 'v1');
  p := (public.chemi_add_partner_v2(u, '민지', '1997-03-12', 'solar', '08:10', 'band', 'male', 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  salt := public.chemi_fp_salt(u);
  fp := 'fp:' || left(encode(extensions.hmac(convert_to('1997-03-12|solar|08:10|band|male', 'UTF8'), decode(salt, 'hex'), 'sha256'), 'hex'), 32);
  insert into public.chemi_readings (user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version, opened_by)
    values (u, 'saju', 'compat', 'changha', public.dukjil_kst_date(), fp, '{}', 'e', 't', 'free') returning id into t;
  update public.chemi_partners set compat_first_date = public.dukjil_kst_date() where id = p;

  -- 별명만 바꾸면 줄을 지우지 않는다.
  res := public.chemi_update_partner_v3(u, p, ' 민지2 ', '1997-03-12', 'solar', '08:10', 'band', 'male');
  if not (res ->> 'updated')::boolean or (res ->> 'erased')::int <> 0 or not exists (select 1 from public.chemi_readings where id = t)
    or (select nickname from public.chemi_partners where id = p) <> '민지2' or (select compat_first_date from public.chemi_partners where id = p) is null then
    raise exception 'nickname-only change erased or failed: %', res; end if;
  -- 생일이 바뀌면 옛 지문 줄이 지워지고 compat_first_date 가 비워진다.
  res := public.chemi_update_partner_v3(u, p, '민지2', '1997-03-13', 'solar', '08:10', 'band', 'male');
  if (res ->> 'erased')::int <> 1 or exists (select 1 from public.chemi_readings where id = t)
    or (select compat_first_date from public.chemi_partners where id = p) is not null or (select birth_date from public.chemi_partners where id = p) <> '1997-03-13' then
    raise exception 'birthday change did not erase old fingerprint rows: %', res; end if;
  -- 남의 상대·없는 상대는 updated false. 만 14세 미만은 거절.
  if (public.chemi_update_partner_v3(other, p, 'x', '1997-03-13', 'solar', null, 'unknown', null) ->> 'updated')::boolean then raise exception 'updated someone else partner'; end if;
  perform pg_temp.expect_error(format('select public.chemi_update_partner_v3(%L,%L,%L,%L,%L,null,%L,null)', u, p, 'x', public.dukjil_kst_date(), 'solar', 'unknown'), 'CHEMI_UNDER_14');

  -- 요약: 읽기만 하고 모든 값이 비어 있지 않은 꼴로 돌아온다.
  s := public.chemi_my_birth_summary(u);
  if (s ->> 'partners')::int <> 1 or (s ->> 'readingDays')::int <> 0 or (s ->> 'sajuReading')::boolean or (s ->> 'askPassesLeft')::int < 0 then raise exception 'summary %', s; end if;
  s := public.chemi_my_birth_summary(other);
  if s <> jsonb_build_object('readingDays', 0, 'askThreads', 0, 'partners', 0, 'orders', 0, 'askPassesLeft', 0, 'sajuReading', false, 'fortuneToday', false, 'starToday', false) then
    raise exception 'empty user summary %', s; end if;
  -- 옛 상대 고치기는 service_role 이 부를 수 없다(없어졌다).
  if exists (select 1 from pg_proc where proname = 'chemi_update_partner' and has_function_privilege('service_role', oid, 'execute')) then
    raise exception 'legacy chemi_update_partner executable'; end if;
  raise notice 'PASS chemi_update_partner_v3 / chemi_my_birth_summary';
end $$;
rollback;

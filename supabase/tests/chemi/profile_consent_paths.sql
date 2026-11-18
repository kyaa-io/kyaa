-- chemi_save_birth: 동의 문구의 판(consent_version)이 바뀔 때만 동의 시각을 새로 찍는다. 저장이 일어나는 모든 경로(같은 값 · 30일 안 채우기 · 일반 고치기)가 같다.
-- 고치기 횟수(edit_count)·고친 시각(edited_at)은 이 규칙과 상관없이 각 경로의 원래 규칙대로다. 일회용·로컬 DB 에서 돌리고 마지막에 ROLLBACK.
begin;
do $$
declare
  u uuid := gen_random_uuid(); old_at constant timestamptz := '2026-01-01 00:00:00+09'; res jsonb; p public.chemi_profiles%rowtype;
  tag text;
  procedure_reset text := 'update public.chemi_profiles set birth_date = ''1995-05-05'', consent_version = ''v1'', consent_at = ''2026-01-01 00:00:00+09'', edited_at = null, edit_count = 0, birth_time = null, time_precision = ''unknown'', birth_place = null where user_id = ''%s''';
begin
  insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:privy:' || u, u || '@example.invalid');
  perform public.chemi_save_birth(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, 'v1');

  -- 1) 같은 값을 같은 판으로 다시: 아무것도 바뀌지 않는다(saved false).
  execute format(procedure_reset, u);
  res := public.chemi_save_birth(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, 'v1');
  select * into p from public.chemi_profiles where user_id = u;
  if (res->>'saved')::boolean or p.consent_version <> 'v1' or p.consent_at <> old_at or p.edit_count <> 0 then raise exception 'same values, same version changed something: % %', res, p; end if;

  -- 2) 같은 값을 새 판으로: 판과 동의 시각만 바뀌고 횟수는 그대로.
  res := public.chemi_save_birth(u, '1995-05-05', 'solar', null, 'unknown', 'female', null, 'v2');
  select * into p from public.chemi_profiles where user_id = u;
  if p.consent_version <> 'v2' or p.consent_at <= old_at or p.edit_count <> 0 or p.edited_at is not null then raise exception 'same values, new version: % %', res, p; end if;

  -- 3) 30일 안 비어 있던 시간·태어난 곳 채우기, 같은 판: 동의 시각·횟수·고친 시각 그대로.
  execute format(procedure_reset, u);
  update public.chemi_profiles set edited_at = clock_timestamp() - interval '12 days', edit_count = 1 where user_id = u;
  select * into p from public.chemi_profiles where user_id = u;
  tag := p.edited_at::text;
  res := public.chemi_save_birth(u, '1995-05-05', 'solar', '14:30', 'exact', 'female', '서울특별시', 'v1');
  select * into p from public.chemi_profiles where user_id = u;
  if not (res->>'saved')::boolean or (res->>'edited')::boolean or p.consent_version <> 'v1' or p.consent_at <> old_at or p.edit_count <> 1 or p.edited_at::text <> tag
     or p.birth_place <> '서울특별시' then raise exception 'lock fill, same version: % %', res, p; end if;

  -- 4) 같은 채우기를 새 판으로: 판·동의 시각이 바뀌고 횟수·고친 시각은 그대로.
  execute format(procedure_reset, u);
  update public.chemi_profiles set edited_at = clock_timestamp() - interval '12 days', edit_count = 1 where user_id = u;
  select * into p from public.chemi_profiles where user_id = u;
  tag := p.edited_at::text;
  res := public.chemi_save_birth(u, '1995-05-05', 'solar', '14:30', 'exact', 'female', '서울특별시', 'v2');
  select * into p from public.chemi_profiles where user_id = u;
  if not (res->>'saved')::boolean or (res->>'edited')::boolean or p.consent_version <> 'v2' or p.consent_at <= old_at or p.edit_count <> 1 or p.edited_at::text <> tag
     then raise exception 'lock fill, new version: % %', res, p; end if;

  -- 5) 30일 밖 일반 고치기: 같은 판은 동의 시각 그대로, 새 판은 새로 찍힌다. 횟수는 둘 다 1 오른다.
  execute format(procedure_reset, u);
  res := public.chemi_save_birth(u, '1995-05-06', 'solar', null, 'unknown', 'female', null, 'v1');
  select * into p from public.chemi_profiles where user_id = u;
  if not (res->>'edited')::boolean or p.consent_at <> old_at or p.edit_count <> 1 then raise exception 'edit, same version: % %', res, p; end if;
  execute format(procedure_reset, u);
  res := public.chemi_save_birth(u, '1995-05-06', 'solar', null, 'unknown', 'female', null, 'v2');
  select * into p from public.chemi_profiles where user_id = u;
  if not (res->>'edited')::boolean or p.consent_version <> 'v2' or p.consent_at <= old_at or p.edit_count <> 1 then raise exception 'edit, new version: % %', res, p; end if;
  raise notice 'PASS chemi_save_birth consent rule is the same on every save path';
end $$;
rollback;

begin;
do $$
declare u uuid := gen_random_uuid(); empty uuid := gen_random_uuid(); s jsonb; d date := public.dukjil_kst_date();
begin
  insert into public.app_users(id, privy_user_id, verified_email) values
    (u, 'did:privy:grow-test', 'grow@example.test'), (empty, 'did:privy:grow-empty', 'grow-empty@example.test');

  -- 기록이 없는 사용자: 세 최애 모두 Lv 1, 앨범·오늘 받은 것 없음.
  s := public.chemi_grow_state(empty);
  if jsonb_array_length(s->'minis') <> 3 or s#>>'{minis,0,character}' <> 'changha' or s#>>'{minis,0,level}' <> '1'
    or s#>'{minis,2,album}' <> '[]' or s->'fresh' <> '[]' or s->'full' <> '[]' then raise exception 'empty %', s; end if;

  if public.chemi_grow_level(0) <> 1 or public.chemi_grow_level(39) <> 1 or public.chemi_grow_level(40) <> 2
    or public.chemi_grow_level(249) <> 4 or public.chemi_grow_level(250) <> 5 or public.chemi_grow_level(2250) <> 15
    or public.chemi_grow_level(9000) <> 30 then raise exception 'level curve'; end if;

  -- 첫 친밀을 받는 쓰기에서 앨범 첫 칸을 연다.
  insert into public.chemi_minis(user_id, character, exp_total) values (u, 'changha', 260), (u, 'dosa', 500);
  if (select count(*) from public.chemi_album where user_id = u and slot = 1) <> 1
    then raise exception 'first affinity must open slot one immediately'; end if;
  insert into public.chemi_exp_log(user_id, character, source, kst_date, exp) values
    (u, 'changha', 'fortune', d, 10), (u, 'elina', 'fortune', d, 10), (u, 'dosa', 'fortune', d, 10);
  s := public.chemi_grow_state(u);
  if s#>>'{minis,0,exp}' <> '260' or s#>>'{minis,0,level}' <> '5' or jsonb_array_length(s#>'{minis,0,album}') <> 2
    or s#>'{minis,0,today}' <> '["fortune"]' or s->'full' <> '["fortune"]' or jsonb_array_length(s->'minis') <> 3
    then raise exception 'auto adopt %', s; end if;

  -- 수동 키우기를 다시 요청해도 이미 열린 앨범과 기록은 중복되지 않는다.
  s := public.chemi_grow_adopt(u, 'changha');
  if jsonb_array_length(s#>'{minis,0,album}') <> 2 or s#>>'{minis,0,album,1,slot}' <> '2'
    or s->'fresh' <> '[]' then raise exception 'adopt %', s; end if;
  s := public.chemi_grow_adopt(u, 'changha');
  if s->'fresh' <> '[]' or jsonb_array_length(s#>'{minis,0,album}') <> 2 then raise exception 'adopt replay %', s; end if;
  if (select count(*) from public.chemi_chain_records where user_id = u and kind = 'album') <> 2
    then raise exception 'chain records'; end if;

  update public.chemi_minis set exp_total = 1000 where user_id = u and character = 'changha';
  s := public.chemi_grow_state(u);
  if s->'fresh' <> '[{"slot": 3, "character": "changha"}]' or s#>>'{minis,0,level}' <> '10' then raise exception 'lv10 %', s; end if;
  if public.chemi_grow_state(u)->'fresh' <> '[]' then raise exception 'fresh twice'; end if;

  begin
    perform public.chemi_grow_adopt(u, 'dosa');
    raise exception 'dosa adopted';
  exception when invalid_parameter_value then null; end;
end $$;
rollback;

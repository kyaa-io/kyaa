-- 케미 성장 탭(최애 키우기) 첫 출시: 친밀 Lv, 기념 앨범 6칸. 표는 20270110010000 에 이미 있고 함수만 더한다.
-- 키우는 최애 = 앨범 1칸(키우기 시작)이 있는 최애. 그 전에 받은 친밀 EXP 는 chemi_minis 에 그대로 쌓여 있다.

-- Lv n 누적 = 10 × n². 0~39 는 Lv 1.
create function public.chemi_grow_level(p_exp bigint) returns integer
language sql immutable set search_path = '' as $$
  select greatest(1, floor(sqrt(p_exp / 10.0))::integer)
$$;

-- 키우는 최애의 Lv 에 맞춰 앨범 칸을 열고(2~6칸 = Lv 5·10·15·20·30), 새로 열린 칸을 기록 대기열에 넣는다.
create function public.chemi_grow_unlock(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare opened record; fresh jsonb := '[]'; at timestamptz := clock_timestamp();
begin
  for opened in
    insert into public.chemi_album(user_id, character, slot, unlocked_at)
      select m.user_id, m.character, s.slot, at from public.chemi_minis m
        join (values (2, 5), (3, 10), (4, 15), (5, 20), (6, 30)) s(slot, lv)
          on public.chemi_grow_level(m.exp_total) >= s.lv
      where m.user_id = p_user and m.character in ('changha', 'elina', 'yuna')
        and exists (select from public.chemi_album a
          where a.user_id = m.user_id and a.character = m.character and a.slot = 1)
      on conflict do nothing
      returning character, slot
  loop
    perform public.chemi_chain_enqueue('album', 'album:' || p_user || ':' || opened.character || ':' || opened.slot, p_user,
      jsonb_build_object('character', opened.character, 'slot', opened.slot,
        'stage', (array[0, 5, 10, 15, 20, 30])[opened.slot]), at);
    fresh := fresh || jsonb_build_object('character', opened.character, 'slot', opened.slot);
  end loop;
  return fresh;
end $$;

create function public.chemi_grow_state(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d date := public.dukjil_kst_date(); fresh jsonb;
begin
  perform public.chemi_lock_user(p_user, false);
  fresh := public.chemi_grow_unlock(p_user);
  return jsonb_build_object(
    'fresh', fresh,
    'full', (select coalesce(jsonb_agg(source), '[]') from (
      select source from public.chemi_exp_log where user_id = p_user and kst_date = d
        group by source having count(*) >= 3) capped),
    'minis', (select jsonb_agg(jsonb_build_object(
        'character', c.name,
        'exp', coalesce(m.exp_total, 0),
        'level', public.chemi_grow_level(coalesce(m.exp_total, 0)),
        'album', (select coalesce(jsonb_agg(jsonb_build_object('slot', a.slot,
            'date', (a.unlocked_at at time zone 'Asia/Seoul')::date) order by a.slot), '[]')
          from public.chemi_album a where a.user_id = p_user and a.character = c.name),
        'today', (select coalesce(jsonb_agg(e.source order by e.source), '[]')
          from public.chemi_exp_log e where e.user_id = p_user and e.character = c.name and e.kst_date = d)
      ) order by c.position)
      from unnest(array['changha', 'elina', 'yuna']) with ordinality c(name, position)
      left join public.chemi_minis m on m.user_id = p_user and m.character = c.name));
end $$;

-- 키우기 시작: 앨범 1칸을 만든다. 다시 불러도 같은 상태를 돌려준다.
create function public.chemi_grow_adopt(p_user uuid, p_character text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare at timestamptz := clock_timestamp();
begin
  perform public.chemi_lock_user(p_user, false);
  if p_character is null or p_character not in ('changha', 'elina', 'yuna') then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  insert into public.chemi_minis(user_id, character, exp_total, adopted_at) values (p_user, p_character, 0, at)
    on conflict (user_id, character) do nothing;
  insert into public.chemi_album(user_id, character, slot, unlocked_at) values (p_user, p_character, 1, at)
    on conflict do nothing;
  if found then
    update public.chemi_minis set adopted_at = at where user_id = p_user and character = p_character;
    perform public.chemi_chain_enqueue('album', 'album:' || p_user || ':' || p_character || ':1', p_user,
      jsonb_build_object('character', p_character, 'slot', 1, 'stage', 0), at);
  end if;
  return public.chemi_grow_state(p_user);
end $$;

revoke all on function public.chemi_grow_level(bigint), public.chemi_grow_unlock(uuid),
  public.chemi_grow_state(uuid), public.chemi_grow_adopt(uuid, text) from public, anon, authenticated;
grant execute on function public.chemi_grow_state(uuid), public.chemi_grow_adopt(uuid, text) to service_role;

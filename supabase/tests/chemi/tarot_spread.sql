-- 타로 세 장: 첫 배열만 저장되고, 다시 불러도 같은 결과를 돌려준다.
begin;
insert into public.app_users(id, privy_user_id, verified_email)
  values ('00000000-0000-4000-8000-0000000000a1', 'did:privy:spread-test', 'spread-test@example.invalid');
do $$
declare
  u constant uuid := '00000000-0000-4000-8000-0000000000a1';
  first jsonb;
  again jsonb;
begin
  if public.chemi_tarot_spread(u, 'changha', null, 'tarot-v1') <> '{"readingId": null}'::jsonb then
    raise exception 'status before the first spread must be empty';
  end if;
  first := public.chemi_tarot_spread(u, 'changha', '{"cards":[{"card":1,"reversed":false},{"card":2,"reversed":true},{"card":3,"reversed":false}]}', 'tarot-v1');
  if (first ->> 'replayed')::boolean or first -> 'result' -> 'cards' -> 1 ->> 'card' <> '2' then
    raise exception 'first spread must be saved as drawn: %', first;
  end if;
  again := public.chemi_tarot_spread(u, 'elina', '{"cards":[{"card":9,"reversed":false},{"card":8,"reversed":false},{"card":7,"reversed":false}]}', 'tarot-v1');
  if not (again ->> 'replayed')::boolean or again ->> 'readingId' <> first ->> 'readingId' or again -> 'result' <> first -> 'result' then
    raise exception 'second call must return the first spread: %', again;
  end if;
  if public.chemi_tarot_spread(u, 'changha', null, 'tarot-v1') ->> 'readingId' <> first ->> 'readingId' then
    raise exception 'status must return the saved spread';
  end if;
  if (select count(*) from public.chemi_readings where user_id = u and kind = 'tarot3') <> 1 then
    raise exception 'only one spread row may exist';
  end if;
  begin
    perform public.chemi_tarot_spread('00000000-0000-4000-8000-0000000000a2', 'changha', '{"cards":[]}', 'tarot-v1');
    raise exception 'unknown account must be rejected';
  exception when sqlstate '42501' then null;
  end;
end $$;
rollback;

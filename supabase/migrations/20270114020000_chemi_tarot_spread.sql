-- 타로 세 장: 계정마다 첫 배열 1번은 무료다. 저장한 배열은 다시 열어도 같은 세 장을 돌려준다.
-- p_result 가 null 이면 저장 없이 이미 본 배열이 있는지만 알려 준다. 추가 배열(유료)은 결제 연결 때 다룬다.
create function public.chemi_tarot_spread(p_user uuid, p_character text, p_result jsonb, p_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved public.chemi_readings;
begin
  perform public.chemi_lock_user(p_user);
  select * into saved from public.chemi_readings
    where user_id = p_user and content = 'tarot' and kind = 'tarot3'
    order by created_at, id limit 1;
  if found then
    return jsonb_build_object('readingId', saved.id, 'result', saved.result, 'character', saved.character,
      'kstDate', saved.kst_date, 'replayed', true);
  end if;
  if p_result is null then
    return jsonb_build_object('readingId', null);
  end if;
  if p_character not in ('changha', 'elina', 'yuna', 'dosa') or p_version is null
    or jsonb_typeof(p_result -> 'cards') is distinct from 'array' or jsonb_array_length(p_result -> 'cards') <> 3 then
    raise exception 'CHEMI_INVALID';
  end if;
  insert into public.chemi_readings(user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version)
    values (p_user, 'tarot', 'tarot3', p_character, public.dukjil_kst_date(), 'first', p_result, p_version, p_version)
    returning * into saved;
  return jsonb_build_object('readingId', saved.id, 'result', saved.result, 'character', saved.character,
    'kstDate', saved.kst_date, 'replayed', false);
end $$;
revoke all on function public.chemi_tarot_spread(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.chemi_tarot_spread(uuid, text, jsonb, text) to service_role;

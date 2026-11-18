-- 케미 r4 profile_fn 보강(W1-DB-3, 검토 CHEMI-W1-DB-2-REVIEW ISSUE 1). 더하기만: 20270112010000 은 고치지 않는다.
-- 상대 지우기가 조회·소금·삭제를 세 RPC 로 나눠 부르던 길에서, 조회 뒤 생일 철회가 끝나면 지운 소금이 되살아났다.
--  · chemi_delete_partner_v3: 사용자 잠금 아래 저장된 상대 입력과 이미 있는 소금으로 지문을 만들어 한 트랜잭션에서 지운다. 소금은 만들지 않는다.
--  · chemi_fp_salt: 생일 동의(chemi_profiles 줄)가 있을 때만 소금을 만든다. 없으면 null(철회 뒤 되살리지 않는다).
--  · 웹은 v3 만 부른다. chemi_delete_partner_v2 의 service_role 실행 권한은 회수한다(되살리는 migration 금지).
-- 탈퇴(묘비) 쪽은 chemi_lock_user 가 활성 계정만 통과시키므로 두 함수 모두 CHEMI_ACCOUNT_CLOSED 로 끝나 아무것도 만들지 않는다.

begin;

-- 지문(설계 r4b §5.2): "fp:" + HMAC-SHA256(소금, birth_date|calendar|HH:MM 또는 빈칸|time_precision|gender 또는 빈칸) 앞 32자.
-- apps/web/server/chemi-profile/fingerprint.ts 와 같은 값이어야 한다(시험: r4_profile.sql E3, handlers.local-db.test.ts).
create function public.chemi_partner_fp(p_salt bytea, p_birth_date date, p_calendar text, p_birth_time time, p_precision text, p_gender text)
returns text language sql immutable set search_path = '' as $$
  select 'fp:' || pg_catalog.left(pg_catalog.encode(extensions.hmac(
    pg_catalog.convert_to(pg_catalog.concat_ws('|', pg_catalog.to_char(p_birth_date, 'YYYY-MM-DD'), p_calendar,
      coalesce(pg_catalog.to_char(p_birth_time, 'HH24:MI'), ''), p_precision, coalesce(p_gender, '')), 'UTF8'),
    p_salt, 'sha256'), 'hex'), 32)
$$;

create or replace function public.chemi_fp_salt(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare salt bytea;
begin
  perform public.chemi_lock_user(p_user);
  if not exists (select 1 from public.chemi_profiles where user_id = p_user) then return null; end if;
  insert into public.chemi_user_state (user_id, fp_salt) values (p_user, extensions.gen_random_bytes(32))
  on conflict (user_id) do update set fp_salt = coalesce(public.chemi_user_state.fp_salt, excluded.fp_salt)
  returning fp_salt into salt;
  return pg_catalog.encode(salt, 'hex');
end $$;

-- 상대 지우기 v3(r4b §5.4): 잠금 아래 상대 줄을 읽고, 그 입력의 지문 줄과 옛 상대 번호 열쇠 줄을 함께 지운다.
-- 소금이 없으면(처음부터 없었거나 철회로 비움) 지문 줄도 있을 수 없으므로 옛 열쇠 줄만 지운다. 지우는 길이라 제재 확인을 하지 않는다.
create function public.chemi_delete_partner_v3(p_user uuid, p_partner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare partner public.chemi_partners%rowtype; salt bytea;
begin
  perform public.chemi_lock_user(p_user);
  if p_partner is null then raise exception 'CHEMI_INVALID' using errcode = '22023'; end if;
  select * into partner from public.chemi_partners where id = p_partner and user_id = p_user for update;
  if not found then return jsonb_build_object('deleted', false); end if;
  select fp_salt into salt from public.chemi_user_state where user_id = p_user;
  perform public.chemi_erase_partner_rows(p_user, p_partner, case when salt is not null then
    public.chemi_partner_fp(salt, partner.birth_date, partner.calendar, partner.birth_time, partner.time_precision, partner.gender) end);
  delete from public.chemi_partners where id = p_partner and user_id = p_user;
  return jsonb_build_object('deleted', true);
end $$;

revoke all on function public.chemi_partner_fp(bytea, date, text, time, text, text), public.chemi_delete_partner_v3(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_delete_partner_v3(uuid, uuid) to service_role;
revoke execute on function public.chemi_delete_partner_v2(uuid, uuid, text) from service_role;

commit;

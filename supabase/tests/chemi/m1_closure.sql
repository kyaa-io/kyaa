-- 케미 M1 · 함수 의존 닫힘 검사(설계 arch-chemi r3 §5.2a). M1 파일만 적용한 DB 에서
-- chemi_* 함수 본문이 부르는 public.chemi_* 이름이 전부 있는지 본다(없는 함수를 부르면 M1 이 닫혀 있지 않다).
do $$
declare missing text;
begin
  select string_agg(distinct p.proname || ' → ' || m[1], ', ') into missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
    lateral regexp_matches(p.prosrc, 'public\.(chemi_[a-z0-9_]+)\s*\(', 'g') m
  where n.nspname = 'public' and p.proname like 'chemi\_%'
    and to_regclass('public.' || m[1]) is null  -- 'insert into public.chemi_x (' 는 표다
    and not exists (select 1 from pg_proc q join pg_namespace s on s.oid = q.pronamespace where s.nspname = 'public' and q.proname = m[1]);
  if missing is not null then raise exception 'm1_closure: missing %', missing; end if;
  -- 계약 함수 7개(§5.2a)와 탈퇴 감싸개 2개가 실제 본문으로 있는지
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('chemi_lock_user','chemi_feature_state','chemi_switch_set','chemi_pass_ensure_initial','chemi_pass_grant','chemi_chain_enqueue',
       'chemi_mail_enqueue','chemi_chain_payload_check','chemi_erase_user','chemi_begin_account_deletion','chemi_complete_account_deletion')
      and length(p.prosrc) > 40) <> 11 then
    raise exception 'm1_closure: contract function missing or empty';
  end if;
end $$;
select 'm1_closure ok' as result;

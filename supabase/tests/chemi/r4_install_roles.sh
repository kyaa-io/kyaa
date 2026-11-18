#!/bin/bash
# 케미 첫 설치 역할 시험(R4E 조건 1·2의 로컬 판, 검토 CHEMI-W1-DB-2-REVIEW ISSUE 3). 일회용 재생 DB 에서만.
# 재생 스크립트가 케미 첫 migration 직전에 부른다:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_BEFORE_MIGRATION=20270110000000_chemi_core.sql \
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/chemi/r4_install_roles.sh bash scripts/verify-clean-migration-chain.sh
# 지금(케미 직전) DB 를 복사해 운영과 같은 역할 꼴을 만든다: 로그인 byus_admin(postgres 구성원) → set role postgres 로 적용,
# public 객체 소유자는 슈퍼유저가 아닌 postgres. 그 위에 케미 migration 을 차례로 적용한다.
#  S1 소유자 정렬(운영 OWNER_MISMATCH 해소 뒤 꼴): 적용 성공 · 첫 설치 판정(케미 객체 0 → 선행 객체 있음) · 새 객체 소유자 postgres ·
#     D1 group_wallet_post 교체 성공 · 두 감싸개 소유자의 위임 대상 EXECUTE · schema_additive·m1_closure ·
#     service_role 로 무데이터 회원 탈퇴(시작→claim→완료·묘비·케미 쓰기 0)와 케미 회원 프로필·상대·철회·탈퇴 길
#  S2 위임 대상 두 함수만 byus_admin 소유(정렬 안 된 꼴): 마지막 profile_guard 가 CHEMI_INSTALL_OWNER 로 설치를 멈춘다
# 끝에 적용한 파일별 sha256 을 찍는다(같은 SHA 설치 영수증의 로컬 판). 복사 DB·역할은 지운다. 원래 재생 DB 는 건드리지 않는다.
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1"
SRC=$($P -At -c "select current_database()")
case "$SRC" in byus_clean|byus_chemi*) ;; *) echo "disposable database required (got $SRC)"; exit 1;; esac
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../../migrations"
fail() { echo "r4_install_roles failed: $*"; exit 1; }
cleanup() {
  for d in byus_chemi_rh1 byus_chemi_rh2; do $P -d "$SRC" -c "drop database if exists $d" >/dev/null 2>&1 || true; done
  $P -d "$SRC" -c "drop role if exists byus_admin" -c "drop role if exists postgres" >/dev/null 2>&1 || true
}
trap cleanup EXIT

[ "$($P -At -c "select count(*) from pg_roles where rolname in ('postgres','byus_admin')")" = 0 ] || fail "roles postgres/byus_admin already exist in this cluster"
# postgres 는 슈퍼유저가 아니지만 BYPASSRLS 다: 가입 트리거(ensure_mobile_default_passport)가 FORCE RLS·정책 없는 표에 쓰는데 운영 가입이 되므로.
# byus_admin 은 둘 다 없다(20261210100000_dukjil_owner_execute.sql 머리 주석의 운영 관찰).
$P -c "create role postgres login nosuperuser nocreatedb nocreaterole noinherit bypassrls" \
   -c "create role byus_admin login nosuperuser nocreatedb nocreaterole noinherit" -c "grant postgres to byus_admin" >/dev/null

# 운영 꼴로 소유자를 바꾼다($2 = yes 면 위임 대상 두 함수만 byus_admin 소유로 남긴다).
prepare() { # db split
  $P -d "$1" >/dev/null <<'SQL'
do $$
declare r record;
begin
  for r in select c.oid::regclass::text n, c.relkind k from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f','S')
      and not (c.relkind = 'S' and exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype in ('a','i')))
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e') loop
    execute format('alter %s %s owner to postgres', case r.k when 'v' then 'view' when 'm' then 'materialized view' when 'f' then 'foreign table' when 'S' then 'sequence' else 'table' end, r.n);
  end loop;
  for r in select p.oid::regprocedure::text n, p.prokind k from pg_proc p where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e') loop
    execute format('alter %s %s owner to postgres', case r.k when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end, r.n);
  end loop;
  for r in select t.oid::regtype::text n from pg_type t where t.typnamespace = 'public'::regnamespace
      and (t.typtype in ('e','d') or (t.typtype = 'c' and exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c')))
      and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e') loop
    execute format('alter type %s owner to postgres', r.n);
  end loop;
end $$;
grant usage, create on schema public to postgres;
grant usage on schema extensions to postgres;
-- 재생 스크립트가 만든 플랫폼 대역 스키마(auth·storage·cron·vault·net)는 슈퍼유저 소유로 남으므로 운영처럼 postgres 가 쓸 수 있게 한다.
grant usage on schema auth, storage, cron, vault, net to postgres;
grant all on all tables in schema auth, storage, cron, vault, net to postgres;
grant all on all sequences in schema auth, storage, cron, vault, net to postgres;
grant execute on all functions in schema auth, storage, cron, vault, net to postgres;
SQL
  if [ "$2" = yes ]; then
    $P -d "$1" -c "alter function public.begin_owned_account_deletion(text) owner to byus_admin" \
       -c "alter function public.complete_account_deletion(uuid,uuid) owner to byus_admin" >/dev/null
  fi
}

# 첫 설치 판정(R4E 1 의 로컬 판): 케미 객체 0, 선행 객체(r3 선행·D1 대상·탈퇴 위임 대상) 있음
first_install() { # db
  [ "$($P -d "$1" -At -c "select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'chemi\_%'")" = 0 ] || fail "$1 chemi relations before install"
  [ "$($P -d "$1" -At -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'chemi\_%'")" = 0 ] || fail "$1 chemi functions before install"
  missing=$($P -d "$1" -At -c "select string_agg(x, ', ') from unnest(array['public.app_users','public.celebrities','public.fan_passports','public.account_deletion_requests',
    'public.mobile_fan_economy_ledger','public.group_wallet_release']) x where to_regclass(x) is null")
  [ -z "$missing" ] || fail "$1 prerequisite tables missing: $missing"
  missing=$($P -d "$1" -At -c "select string_agg(x, ', ') from unnest(array['public.begin_owned_account_deletion(text)','public.complete_account_deletion(uuid,uuid)',
    'public.claim_account_deletion(uuid)','public.dukjil_kst_date(timestamptz)']) x where to_regprocedure(x) is null")
  [ -z "$missing" ] || fail "$1 prerequisite functions missing: $missing"
  [ -n "$($P -d "$1" -At -c "select p.oid from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='group_wallet_post' limit 1")" ] || fail "$1 group_wallet_post missing"
}

apply_all() { # db → 마지막으로 적용한 파일 이름(실패하면 그 파일, 오류는 $OUT)
  for f in $(ls "$MIG" | awk '$0 >= "20270110000000_chemi_core.sql"' | sort); do
    if ! { echo "set role postgres;"; sed -E '/^create extension if not exists (pgcrypto|pg_cron|pg_net|supabase_vault) /d' "$MIG/$f"; } \
        | psql -X -q -v ON_ERROR_STOP=1 -U byus_admin -d "$1" >/dev/null 2>"$OUT"; then
      echo "FAILED $f"; return 0
    fi
    echo "APPLIED $f $(shasum -a 256 "$MIG/$f" | cut -c1-64)"
  done
}
OUT=$(mktemp)

# S1 ---------------------------------------------------------------------------------------------------
$P -c "create database byus_chemi_rh1 template $SRC" >/dev/null
prepare byus_chemi_rh1 no
first_install byus_chemi_rh1
echo "S1 first install: chemi objects 0, prerequisites present"
log=$(apply_all byus_chemi_rh1)
echo "$log"
! grep -q '^FAILED' <<<"$log" || fail "S1 install failed: $(grep '^FAILED' <<<"$log") $(cat "$OUT")"
Q="$P -d byus_chemi_rh1"
bad=$($Q -At -c "select string_agg(kind||' '||ident||' '||owner, '; ') from (
  select 'rel' kind, c.oid::regclass::text ident, pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S','f')
    and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
  union all select 'fn', p.oid::regprocedure::text, pg_get_userbyid(p.proowner) from pg_proc p where p.pronamespace='public'::regnamespace
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')) o where owner <> 'postgres'")
[ -z "$bad" ] || fail "S1 public objects not owned by postgres: $bad"
echo "S1 owners: every public table/function owned by postgres"
[ "$($Q -At -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='group_wallet_post' and prosrc like '%chemi_%'")" -ge 1 ] || fail "S1 D1 group_wallet_post not replaced"
echo "S1 D1: group_wallet_post replaced under set role postgres"
r=$($Q -At -c "select string_agg(w::text||'='||pg_get_userbyid(p.proowner)||':'||has_function_privilege(p.proowner, d, 'EXECUTE'), ' ')
  from (values ('public.chemi_begin_account_deletion(text)'::regprocedure, 'public.begin_owned_account_deletion(text)'::regprocedure),
    ('public.chemi_complete_account_deletion(uuid,uuid)'::regprocedure, 'public.complete_account_deletion(uuid,uuid)'::regprocedure)) v(w, d) join pg_proc p on p.oid = v.w")
[ "$r" = "chemi_begin_account_deletion(text)=postgres:true chemi_complete_account_deletion(uuid,uuid)=postgres:true" ] || fail "S1 wrapper EXECUTE: $r"
echo "S1 wrappers: $r"
$Q -f "$HERE/schema_additive.sql" >/dev/null
$Q -f "$HERE/m1_closure.sql" >/dev/null
echo "S1 schema_additive ok · m1_closure ok"

# service_role 로 라우트 길(웹·워커가 부르는 RPC 만). 무데이터 회원 탈퇴 → 묘비·케미 쓰기 0, 케미 회원 → 케미 줄 0.
$Q -At >/dev/null <<'SQL'
insert into public.app_users (id, privy_user_id, verified_email) values
  ('c4000000-0000-4000-8000-000000000001', 'did:privy:rh-plain', 'rh-plain@example.test'),
  ('c4000000-0000-4000-8000-000000000002', 'did:privy:rh-chemi', 'rh-chemi@example.test');
SQL
$Q -At >"$OUT" <<'SQL'
set role service_role;
do $$
declare plain uuid := 'c4000000-0000-4000-8000-000000000001'; u uuid := 'c4000000-0000-4000-8000-000000000002'; tok uuid; p uuid; n int;
begin
  perform public.chemi_begin_account_deletion('did:privy:rh-plain');
  tok := (public.claim_account_deletion(plain) ->> 'leaseToken')::uuid;
  if not public.chemi_complete_account_deletion(plain, tok) then raise exception 'plain deletion not completed'; end if;

  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', null, null, null, null, null, null, null, 'v1');
  p := (public.chemi_add_partner_v2(u, '민지', '1997-03-12', 'solar', '08:10', 'band', 'male', 'saju', null, null, null, null) ->> 'partnerId')::uuid;
  if public.chemi_fp_salt(u) !~ '^[0-9a-f]{64}$' then raise exception 'salt'; end if;
  if not (public.chemi_delete_partner_v3(u, p) ->> 'deleted')::boolean then raise exception 'delete v3'; end if;
  perform public.chemi_withdraw_birth_consent(u);
  if public.chemi_fp_salt(u) is not null then raise exception 'salt after withdrawal'; end if;
  perform public.chemi_save_birth_v2(u, '1995-05-05', 'solar', null, 'unknown', null, null, null, null, null, null, null, 'v1');
  perform public.chemi_begin_account_deletion('did:privy:rh-chemi');
  tok := (public.claim_account_deletion(u) ->> 'leaseToken')::uuid;
  if not public.chemi_complete_account_deletion(u, tok) then raise exception 'chemi member deletion not completed'; end if;
end $$;
SQL
[ "$($Q -At -c "select count(*) from public.account_subject_tombstones where app_user_id in ('c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')")" = 2 ] || fail "S1 tombstones"
left=$($Q -At -c "select coalesce(sum(n),0) from (select (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I where user_id in (''c4000000-0000-4000-8000-000000000001'',''c4000000-0000-4000-8000-000000000002'')', c.relname), false, false, '')))[1]::text::int n
  from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'chemi\_%') s")
[ "$left" = 0 ] || fail "S1 chemi rows left after service_role deletion: $left"
echo "S1 service_role: no-data member begin→claim→complete true · tombstone · chemi rows 0; chemi member profile→partner v3→withdraw→delete · chemi rows 0"
$P -c "drop database byus_chemi_rh1" >/dev/null

# S2 ---------------------------------------------------------------------------------------------------
$P -c "create database byus_chemi_rh2 template $SRC" >/dev/null
prepare byus_chemi_rh2 yes
log=$(apply_all byus_chemi_rh2)
grep -q '^FAILED 20270112020000_chemi_r4_profile_guard.sql' <<<"$log" || fail "S2 install did not stop at profile_guard: $(tail -2 <<<"$log")"
grep -q 'CHEMI_INSTALL_OWNER: deletion wrapper owner cannot execute' "$OUT" || fail "S2 wrong error: $(cat "$OUT")"
[ "$($P -d byus_chemi_rh2 -At -c "select count(*) from pg_proc where proname='chemi_delete_partner_v3'")" = 0 ] || fail "S2 profile_guard partly applied"
echo "S2 delegates owned by byus_admin: install stops at profile_guard with CHEMI_INSTALL_OWNER (nothing from that file applied)"
echo "r4_install_roles ok"

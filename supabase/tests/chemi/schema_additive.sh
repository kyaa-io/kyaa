#!/usr/bin/env bash
# 케미 M1 · 더하기만 검사(설계 arch-chemi r3 §2.1). PG* 환경값의 DB = 케미 마이그레이션까지 적용한 일회용 DB.
#  1. CHEMI_BASE_DB(같은 서버, 케미 마이그레이션 직전까지 적용)와 비교해 케미 밖 객체의 정의·권한·트리거·제약·색인·정책이 같다
#     (CHEMI_BASE_DB 가 없으면 이 비교를 건너뛰고 그렇게 출력한다)
#  2. chemi_* 표·함수·색인의 소유자는 기존 객체(public.app_users)와 같은 역할(운영·DEV 적용 = postgres)
#  3. chemi_* 표는 RLS 켬·정책 0, anon·authenticated·service_role·PUBLIC 의 표 권한 0
#  4. chemi_* 함수 실행 권한은 service_role 에 허용 목록만, anon·authenticated·PUBLIC 0
#  5. 시드 0: chemi_* 표가 모두 비어 있음(시험 줄을 넣기 전에 돌린다)
set -euo pipefail
P="psql -X -q -v ON_ERROR_STOP=1 -At"
fail() { echo "schema_additive failed: $*"; exit 1; }

FINGERPRINT=$(cat <<'SQL'
with f as (
  select 'fn '||p.oid::regprocedure::text||' '||pg_get_userbyid(p.proowner)||' '||md5(p.prosrc)||' '||coalesce(p.proacl::text,'')||' '||p.prosecdef||' '||coalesce(p.proconfig::text,'') x
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and n.nspname not like 'pg_temp%' and p.proname not like 'chemi\_%'
  union all select 'rel '||c.oid::regclass::text||' '||c.relkind::text||' '||pg_get_userbyid(c.relowner)||' '||coalesce(c.relacl::text,'')||' '||c.relrowsecurity||' '||c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and c.relname not like 'chemi\_%'
  union all select 'col '||a.attrelid::regclass::text||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||' '||a.attnotnull||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and n.nspname not in ('pg_catalog','information_schema','pg_toast') and c.relname not like 'chemi\_%'
  union all select 'con '||conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint
  where connamespace not in ('pg_catalog'::regnamespace,'information_schema'::regnamespace) and conrelid<>0 and conrelid::regclass::text not like '%chemi\_%'
  union all select 'trg '||tgrelid::regclass::text||' '||tgname||' '||tgenabled::text||' '||pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid::regclass::text not like '%chemi\_%'
  union all select 'idx '||indexrelid::regclass::text||' '||pg_get_indexdef(indexrelid) from pg_index where indrelid::regclass::text not like '%chemi\_%' and indrelid::regclass::text not like 'pg\_%'
  union all select 'pol '||polrelid::regclass::text||' '||polname||' '||coalesce(pg_get_expr(polqual,polrelid),'') from pg_policy
  union all select 'view '||c.oid::regclass::text||' '||md5(pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and n.nspname not in ('pg_catalog','information_schema')
  union all select 'defacl '||defaclrole::regrole::text||' '||defaclobjtype::text||' '||coalesce(defaclacl::text,'') from pg_default_acl
  union all select 'role '||rolname||' '||rolsuper||' '||rolbypassrls from pg_roles where rolname not like 'pg\_%'
) select md5(string_agg(x, E'\n' order by x)) || ' ' || count(*) from f
SQL
)
if [ -n "${CHEMI_BASE_DB:-}" ]; then
  before=$(PGDATABASE="$CHEMI_BASE_DB" $P -c "$FINGERPRINT")
  after=$($P -c "$FINGERPRINT")
  [ "$before" = "$after" ] || fail "1. objects outside chemi_* changed ($before → $after)"
  echo "1. non-chemi catalog unchanged ($after)"
else
  echo "1. skipped: CHEMI_BASE_DB not set"
fi

$P <<'SQL'
do $$
declare bad text; n bigint; t record; owner text := (select pg_get_userbyid(relowner) from pg_class where oid = 'public.app_users'::regclass);
  service_fns constant text[] := array['chemi_feature_state','chemi_save_birth','chemi_read_profile','chemi_add_partner','chemi_delete_partner',
    'chemi_purge_stale_partners','chemi_withdraw_birth_consent','chemi_begin_account_deletion','chemi_complete_account_deletion'];
begin
  select string_agg(c.relname||':'||pg_get_userbyid(c.relowner), ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relname like 'chemi\_%' and pg_get_userbyid(c.relowner)<>owner;
  if bad is not null then raise exception '2. owner not %: %', owner, bad; end if;
  select string_agg(p.proname||':'||pg_get_userbyid(p.proowner), ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and pg_get_userbyid(p.proowner)<>owner;
  if bad is not null then raise exception '2. function owner not %: %', owner, bad; end if;

  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%'
      and (not c.relrowsecurity or exists (select 1 from pg_policy where polrelid=c.oid)
        or has_table_privilege('anon', c.oid, 'select,insert,update,delete') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
        or has_table_privilege('service_role', c.oid, 'select,insert,update,delete')
        or exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0));
  if bad is not null then raise exception '3. table access open: %', bad; end if;

  select string_agg(p.oid::regprocedure::text, ', ') into bad from pg_proc p join pg_namespace s on s.oid=p.pronamespace
    where s.nspname='public' and p.proname like 'chemi\_%' and (
      has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
      or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)
      or has_function_privilege('service_role', p.oid, 'execute') <> (p.proname = any(service_fns)));
  if bad is not null then raise exception '4. function grants: %', bad; end if;

  for t in select c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%' loop
    execute format('select count(*) from public.%I', t.relname) into n;
    if n > 0 then raise exception '5. % has % seed rows', t.relname, n; end if;
  end loop;
end $$;
SQL
echo "2-5. owner $($P -c "select pg_get_userbyid(relowner) from pg_class where oid = 'public.app_users'::regclass") (same as app_users) · RLS on/no policy · no table grants · function grants allowlisted · 0 seed rows ($($P -c "select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and c.relname like 'chemi\_%'") tables, $($P -c "select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname like 'chemi\_%'") functions)"
echo "schema_additive ok"

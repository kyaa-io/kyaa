#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proof_dir="$root_dir/work/display-translation-concurrency"
mkdir -p "$proof_dir"
psql -X -v ON_ERROR_STOP=1 <<'SQL' >"$proof_dir/setup.log"
do $$begin if current_database()<>'byus_clean' then raise exception 'disposable database required';end if;end$$;
delete from public.content_translation_requests;
delete from public.display_translation_requests;
insert into public.app_users(id,privy_user_id,verified_email) values
 ('dd260000-0000-4000-8000-000000000001','did:privy:display-race-a','display-race-a@byus.test'),
 ('dd260000-0000-4000-8000-000000000002','did:privy:display-race-b','display-race-b@byus.test');
SQL
psql -X -v ON_ERROR_STOP=1 <<'SQL' >"$proof_dir/object.log" 2>&1 &
begin;
select public.reserve_content_translation_request('dd260000-0000-4000-8000-000000000001',10000);
select pg_sleep(0.5);
commit;
SQL
first_pid=$!
psql -X -v ON_ERROR_STOP=1 <<'SQL' >"$proof_dir/display.log" 2>&1 &
begin;
select public.reserve_display_translation_request('dd260000-0000-4000-8000-000000000002',repeat('d',64),10000);
select pg_sleep(0.5);
commit;
SQL
second_pid=$!
wait "$first_pid"
wait "$second_pid"
if psql -X -v ON_ERROR_STOP=1 -c "select public.reserve_display_translation_request(null,repeat('e',64),1)" >"$proof_dir/over-budget.log" 2>&1; then
  echo 'FAIL: concurrent translation budget exceeded' >&2
  exit 1
fi
grep -q 'TRANSLATION_RATE_LIMITED' "$proof_dir/over-budget.log"
psql -X -v ON_ERROR_STOP=1 <<'SQL' >"$proof_dir/assert.log"
do $$begin
 if (select coalesce(sum(character_count),0) from (select character_count from public.content_translation_requests union all select character_count from public.display_translation_requests) x)<>20000 then raise exception 'shared concurrent ledger count mismatch';end if;
end$$;
delete from public.content_translation_requests;
delete from public.display_translation_requests;
SQL
echo 'DISPLAY_TRANSLATION_CONCURRENCY_PASS: object/display APIs share one serial budget'

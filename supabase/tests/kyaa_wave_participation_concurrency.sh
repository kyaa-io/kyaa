#!/usr/bin/env bash
set -euo pipefail
# Only run against the disposable database passed by verify-clean-migration-chain.sh.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email,status) values
('ab000000-0000-4000-8000-000000000001','did:privy:kyaa-race','kyaa-race@example.test','active'),
('ab000000-0000-4000-8000-000000000002','did:privy:kyaa-disable-first','kyaa-disable-first@example.test','active');
update public.kyaa_wave_participation_config set code_hash=repeat('a',64),enabled=true;
SQL
wait_checkpoint() {
 local ready=false
 for _ in {1..50}; do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep 0.1
 done
 [[ "$ready" == true ]] || { echo "participation holder checkpoint missing: $1" >&2; return 1; }
}
PGAPPNAME=kyaa_submit_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.submit_kyaa_wave_participation('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000010',repeat('a',64),repeat('b',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12));
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_submit_holder
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
select public.submit_kyaa_wave_participation('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',repeat('a',64),repeat('c',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('D',12));
do $$ begin if (select count(*) from public.kyaa_wave_participants where app_user_id='ab000000-0000-4000-8000-000000000001')<>1 then raise exception 'parallel duplicate receipt'; end if; end $$;
SQL
wait "$holder"
# Submission holds the owner lock; disable must wait then erase every private row.
PGAPPNAME=kyaa_erase_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.submit_kyaa_wave_participation('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000012',repeat('a',64),repeat('c',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('D',12));
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_erase_holder
psql -X -v ON_ERROR_STOP=1 -q -c "update public.app_users set status='disabled' where id='ab000000-0000-4000-8000-000000000001'"
wait "$holder"
# Disable first: a waiting submission must recheck active status after the lock.
PGAPPNAME=kyaa_disable_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtextextended('fan-web-user:ab000000-0000-4000-8000-000000000002',0));
update public.app_users set status='disabled' where id='ab000000-0000-4000-8000-000000000002';
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_disable_holder
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 begin
  perform public.submit_kyaa_wave_participation('ab000000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('a',64),repeat('c',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('D',12));
  raise exception 'disabled concurrent owner accepted';
 exception when insufficient_privilege then null; end;
end $$;
SQL
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 if exists(select 1 from public.kyaa_wave_participants where app_user_id in('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002')) or exists(select 1 from public.kyaa_wave_participation_requests where app_user_id in('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002')) or exists(select 1 from public.kyaa_wave_participation_attempts where app_user_id in('ab000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002')) then raise exception 'concurrent disable retained private participation'; end if;
end $$;
SQL

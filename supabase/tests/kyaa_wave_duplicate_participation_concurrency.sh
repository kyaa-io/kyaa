#!/usr/bin/env bash
set -euo pipefail
# Disposable database only; caller owns the clean migration chain.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email,status)
 select ('ae000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'did:privy:wave-duplicate-race-'||n,'wave-duplicate-race-'||n||'@example.test','active' from generate_series(1,4) n;
insert into public.admin_allowlist(id,email,role,active) values('ae000000-0000-4000-8000-000000000010','wave-duplicate-race-4@example.test','admin',true);
update public.kyaa_wave_participation_config set code_hash=repeat('a',64),enabled=true;
SQL
wait_checkpoint() {
 local ready=false
 for _ in {1..50}; do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep 0.1
 done
 [[ "$ready" == true ]] || { echo "duplicate holder checkpoint missing: $1" >&2; return 1; }
}
PGAPPNAME=kyaa_name_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
do $$ declare result jsonb; begin
 result:=public.submit_kyaa_wave_participation('ae000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),repeat('b',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12),repeat('9',64));
 if result->'participation' is null then raise exception 'race first submit failed'; end if;
end $$;
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_name_holder
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ declare result jsonb; begin
 -- Emulate the legacy body's unguarded insert while another submission remains in flight.
 begin
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values('ae000000-0000-4000-8000-000000000002','v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12));
  raise exception 'legacy in-flight NULL insert accepted';
 exception when check_violation then null; end;
 result:=public.submit_kyaa_wave_participation('ae000000-0000-4000-8000-000000000002',gen_random_uuid(),repeat('a',64),repeat('b',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12),repeat('9',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'race admitted duplicate'; end if;
 if (select count(*) from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and name_fingerprint=repeat('9',64))<>1 then raise exception 'race duplicate count'; end if;
end $$;
SQL
wait "$holder"
# Operator grant first: disable waits for its target lock, then scrubs the grant.
PGAPPNAME=kyaa_exception_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.grant_kyaa_wave_participation_name_exception('ae000000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000010',gen_random_uuid(),'ae000000-0000-4000-8000-000000000002',repeat('9',64));
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_exception_holder
psql -X -v ON_ERROR_STOP=1 -q -c "update public.app_users set status='disabled' where id='ae000000-0000-4000-8000-000000000002'"
wait "$holder"
# Disable first: operator grant must recheck the target after the shared user lock.
PGAPPNAME=kyaa_exception_disable_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtextextended('fan-web-user:ae000000-0000-4000-8000-000000000003',0));
update public.app_users set status='disabled' where id='ae000000-0000-4000-8000-000000000003';
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint kyaa_exception_disable_holder
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 begin
  perform public.grant_kyaa_wave_participation_name_exception('ae000000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000010',gen_random_uuid(),'ae000000-0000-4000-8000-000000000003',repeat('9',64));
  raise exception 'disabled race target approved';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.kyaa_wave_participation_name_exceptions where app_user_id in('ae000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000003')) then raise exception 'race retained exception'; end if;
end $$;
SQL
wait "$holder"

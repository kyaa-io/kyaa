#!/usr/bin/env bash
# Disposable clean-chain database only; connection is inherited from the harness.
set -euo pipefail
ARTIFACT_DIR="${ARTIFACT_DIR:-work/runmusic-qr-20261020/concurrency}"
mkdir -p "$ARTIFACT_DIR"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/setup.log" 2>&1 <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values
 ('cb000000-0000-4000-8000-000000000001','did:privy:rm-race-admin','rm-race-admin@example.invalid'),
 ('cb000000-0000-4000-8000-000000000002','did:privy:rm-race-user','rm-race-user@example.invalid'),
 ('cb000000-0000-4000-8000-000000000003','did:privy:rm-race-boundary','rm-race-boundary@example.invalid');
insert into public.admin_allowlist(id,email,role)values('cb000000-0000-4000-8000-000000000004','rm-race-admin@example.invalid','admin');
update public.runmusic_campaign set published=true,registration_opens_at=clock_timestamp()-interval'3 hours',registration_closes_at=clock_timestamp()-interval'1 hour',event_starts_at=clock_timestamp()-interval'1 hour',event_ends_at=clock_timestamp()+interval'1 hour',checkin_hash=encode(extensions.digest('race-code-secret-123','sha256'),'hex');
SQL
for i in 1 2; do
 psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/checkin-$i.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.submit_owned_runmusic('cb000000-0000-4000-8000-000000000002','{"action":"checkin","requestKey":"cb000000-0000-4000-8000-000000000005","code":"race-code-secret-123"}');
SQL
 eval "CHECKIN_$i=$!"
done
wait "$CHECKIN_1"; wait "$CHECKIN_2"
# A request begun before cutoff but released after it must use the post-lock clock.
PGAPPNAME=runmusic_boundary_holder psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/boundary-holder.log" 2>&1 <<'SQL' &
begin;
update public.runmusic_campaign set event_ends_at=clock_timestamp()+interval'1 second';
select pg_sleep(3);
commit;
SQL
HOLDER=$!
ready=false
for _ in {1..50}; do
 if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='runmusic_boundary_holder'and wait_event='PgSleep')")" == t ]];then ready=true;break;fi
 sleep 0.1
done
[[ "$ready" == true ]] || { echo 'boundary holder failed to start' >&2;exit 1; }
if psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/boundary-result.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.submit_owned_runmusic('cb000000-0000-4000-8000-000000000003','{"action":"checkin","requestKey":"cb000000-0000-4000-8000-000000000006","code":"race-code-secret-123"}');
SQL
then echo 'post-lock cutoff bypassed' >&2;exit 1;fi
wait "$HOLDER"
grep -Fq RUNMUSIC_CLOSED "$ARTIFACT_DIR/boundary-result.log"
for i in 1 2; do
 psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/draw-$i.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.admin_runmusic('cb000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000004',gen_random_uuid(),'draw',jsonb_build_object('requestKey',gen_random_uuid()));
SQL
 eval "DRAW_$i=$!"
done
wait "$DRAW_1";wait "$DRAW_2"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/publish.log" 2>&1 <<'SQL'
select public.admin_runmusic('cb000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000004',gen_random_uuid(),'settings',jsonb_build_object('resultsPublished',true,'expectedRevision',(select revision from public.runmusic_campaign)));
SQL
for i in 1 2; do
 psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/receive-$i.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.admin_runmusic('cb000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000004',gen_random_uuid(),'receive',jsonb_build_object('receiptId',receipt_id))from public.runmusic_draw_entries where winner;
SQL
 eval "RECEIVE_$i=$!"
done
wait "$RECEIVE_1";wait "$RECEIVE_2"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/assert.log" 2>&1 <<'SQL'
do $$begin
 if(select count(*)from public.runmusic_missions where app_user_id='cb000000-0000-4000-8000-000000000002'and mission='checkin')<>1 then raise exception 'duplicate mission';end if;
 if(select count(*)from public.runmusic_attempts where app_user_id='cb000000-0000-4000-8000-000000000002'and attempts=1)<>1 then raise exception 'duplicate attempt';end if;
 if(select count(*)from public.runmusic_draw_entries)<>1 or(select count(*)from public.runmusic_draw_entries where winner and received_at is not null)<>1 then raise exception 'draw/receipt race failed';end if;
end$$;
SQL
grep -Fq '"replayed": false' "$ARTIFACT_DIR"/receive-*.log
grep -Fq '"replayed": true' "$ARTIFACT_DIR"/receive-*.log
echo "Runmusic duplicate completion / cutoff / draw / receipt races PASS; logs: $ARTIFACT_DIR"

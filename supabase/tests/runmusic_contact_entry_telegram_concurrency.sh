#!/usr/bin/env bash
# Disposable clean-chain DB only. No Telegram/provider call.
set -euo pipefail
ARTIFACT_DIR="${ARTIFACT_DIR:-work/runmusic-contact-telegram/concurrency}"
mkdir -p "$ARTIFACT_DIR"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/setup.log" 2>&1 <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values
 ('cd000000-0000-4000-8000-000000000001','did:privy:rmt-race','race@example.invalid');
insert into public.runmusic_registrations(app_user_id)values('cd000000-0000-4000-8000-000000000001');
insert into public.runmusic_contacts(app_user_id,ciphertext,masked,fingerprint)
 values('cd000000-0000-4000-8000-000000000001','old','o***',repeat('a',64));
insert into public.runmusic_telegram_deliveries(app_user_id)values('cd000000-0000-4000-8000-000000000001');
update public.runmusic_campaign set published=true where slug='runmusic-2026';
SQL
for i in 1 2; do
 psql -X -v ON_ERROR_STOP=1 -Atq -c "select public.claim_runmusic_telegram_delivery('cd000000-0000-4000-8000-000000000001')" >"$ARTIFACT_DIR/claim-$i.log" 2>&1 &
 eval "CLAIM_$i=$!"
done
wait "$CLAIM_1";wait "$CLAIM_2"
[[ "$(cat "$ARTIFACT_DIR/claim-1.log" "$ARTIFACT_DIR/claim-2.log" | rg -c claimToken)" == 1 ]]
DELIVERY_ID="$(psql -X -Atq -c "select id from public.runmusic_telegram_deliveries where app_user_id='cd000000-0000-4000-8000-000000000001'")"
TOKEN="$(psql -X -Atq -c "select claim_token from public.runmusic_telegram_deliveries where id='$DELIVERY_ID'")"
# Save holds campaign -> owner before the queued begin. Begin must get the committed latest contact.
PGAPPNAME=runmusic_contact_snapshot_holder psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/snapshot-holder.log" 2>&1 <<'SQL' &
begin;
select public.submit_owned_runmusic_v2('cd000000-0000-4000-8000-000000000001',
 '{"action":"save_contact","requestKey":"cd000000-0000-4000-8000-000000000002","ciphertext":"latest-race","masked":"l***","fingerprint":"latest"}');
update public.app_users set verified_email='latest-race@example.invalid' where id='cd000000-0000-4000-8000-000000000001';
select pg_sleep(2);
commit;
SQL
HOLDER=$!
READY=false
for _ in {1..50};do
 if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='runmusic_contact_snapshot_holder' and wait_event='PgSleep')")" == t ]];then READY=true;break;fi
 sleep 0.1
done
[[ "$READY" == true ]] || { echo 'snapshot holder failed to start' >&2;exit 1; }
for i in 1 2;do
 psql -X -v ON_ERROR_STOP=1 -Atq -c "set statement_timeout='12s'; select public.begin_runmusic_telegram_delivery('$DELIVERY_ID','$TOKEN','-100123')" >"$ARTIFACT_DIR/begin-$i.log" 2>&1 &
 eval "BEGIN_$i=$!"
done
wait "$HOLDER";wait "$BEGIN_1";wait "$BEGIN_2"
[[ "$(cat "$ARTIFACT_DIR/begin-1.log" "$ARTIFACT_DIR/begin-2.log" | rg -c latest-race@example.invalid)" == 1 ]]
[[ "$(cat "$ARTIFACT_DIR/begin-1.log" "$ARTIFACT_DIR/begin-2.log" | rg -c latest-race)" == 1 ]]
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/assertions.log" 2>&1 <<'SQL'
do $$begin
 if not exists(select 1 from public.runmusic_telegram_deliveries
  where app_user_id='cd000000-0000-4000-8000-000000000001' and state='sending' and attempts=1)
 then raise exception 'parallel begin must authorize exactly one send';end if;
end$$;
SQL
# Finish once, then prove an expired ambiguous attempt can never produce another begin.
psql -X -v ON_ERROR_STOP=1 -Atq -c "select public.finish_runmusic_telegram_delivery('$DELIVERY_ID','$TOKEN','unknown')" >"$ARTIFACT_DIR/unknown.log"
psql -X -v ON_ERROR_STOP=1 -q >>"$ARTIFACT_DIR/assertions.log" 2>&1 <<'SQL'
do $$begin
 if public.claim_runmusic_telegram_delivery('cd000000-0000-4000-8000-000000000001') is not null
 then raise exception 'unknown attempt must never retry';end if;
end$$;
SQL
printf '%s\n' 'RUNMUSIC concurrent claim, latest snapshot and single begin passed'

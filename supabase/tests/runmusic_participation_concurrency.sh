#!/usr/bin/env bash
# Disposable clean-chain database only; connection is inherited from the harness.
set -euo pipefail
ARTIFACT_DIR="${ARTIFACT_DIR:-work/runmusic-simple-entry-20261023/concurrency}"
mkdir -p "$ARTIFACT_DIR"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/runmusic_result_notifications.sql" >"$ARTIFACT_DIR/notifications.log" 2>&1
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/setup.log" 2>&1 <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email) values
 ('cb000000-0000-4000-8000-000000000001','did:privy:rm-race-admin','rm-race-admin@example.invalid'),
 ('cb000000-0000-4000-8000-000000000003','did:privy:rm-race-boundary','rm-race-boundary@example.invalid');
insert into public.admin_allowlist(id,email,role)values('cb000000-0000-4000-8000-000000000004','rm-race-admin@example.invalid','admin');
insert into public.app_users(id,privy_user_id,verified_email)
 select ('cb000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,'did:privy:rm-race-'||i,'rm-race-'||i||'@example.invalid' from generate_series(1,166)i;
insert into public.runmusic_registrations(app_user_id) select id from public.app_users where privy_user_id like 'did:privy:rm-race-%' and privy_user_id not in('did:privy:rm-race-admin','did:privy:rm-race-boundary');
insert into public.runmusic_contacts(app_user_id,ciphertext,masked,fingerprint) select app_user_id,'fixture','f***','fixture' from public.runmusic_registrations;
update public.runmusic_campaign set published=true,auto_publish_enabled=true,
 registration_opens_at=clock_timestamp()-interval'3 hours',
 registration_closes_at=clock_timestamp()+interval'1 hour',event_starts_at=clock_timestamp()+interval'1 hour',event_ends_at=clock_timestamp()+interval'2 hours',entry_closes_at=clock_timestamp()+interval'1 hour',results_at=clock_timestamp()+interval'1 hour';
create function public.runmusic_test_fixed_seed() returns trigger language plpgsql as $$begin if old.draw_id is null and new.draw_id is not null then new.draw_seed:=repeat('42',32);end if;return new;end$$;
create trigger runmusic_test_fixed_seed before update on public.runmusic_campaign for each row execute function public.runmusic_test_fixed_seed();
SQL
for i in 1 2; do
 psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/contact-$i.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.submit_owned_runmusic_v2('cb000000-0000-4000-8001-000000000001','{"action":"save_contact","requestKey":"cb000000-0000-4000-8000-000000000005","ciphertext":"saved","masked":"s***","fingerprint":"same"}');
SQL
 eval "CONTACT_$i=$!"
done
wait "$CONTACT_1";wait "$CONTACT_2"
wait_holder() {
 local app="$1" ready=false
 for _ in {1..50};do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$app' and wait_event='PgSleep')")" == t ]];then ready=true;break;fi
  sleep 0.1
 done
 [[ "$ready" == true ]] || { echo "holder did not start: $app" >&2;exit 1; }
}
# Waiting requests must use the clock after acquiring the campaign lock.
PGAPPNAME=runmusic_boundary_holder psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/boundary-holder.log" 2>&1 <<'SQL' &
begin;
update public.runmusic_campaign set entry_closes_at=clock_timestamp()+interval'1 second';
select pg_sleep(3);
commit;
SQL
HOLDER=$!
wait_holder runmusic_boundary_holder
if psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/boundary-result.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.submit_owned_runmusic_v2('cb000000-0000-4000-8000-000000000003','{"action":"enter","requestKey":"cb000000-0000-4000-8000-000000000006"}');
SQL
then echo 'post-lock cutoff bypassed' >&2;exit 1;fi
wait "$HOLDER"
grep -Fq RUNMUSIC_CLOSED "$ARTIFACT_DIR/boundary-result.log"
# The known final rank is a loser. Save starts while publication is uncommitted.
LOSER_ID="$(psql -X -Atq -c "select app_user_id from public.runmusic_registrations order by extensions.digest(repeat('42',32)||app_user_id::text,'sha256') desc,app_user_id desc limit 1")"
PGAPPNAME=runmusic_publish_holder psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/publish-holder.log" 2>&1 <<'SQL' &
begin;
update public.runmusic_campaign set results_at=clock_timestamp()-interval'1 second';
select public.process_due_runmusic();
select pg_sleep(3);
commit;
SQL
HOLDER=$!
wait_holder runmusic_publish_holder
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/draw-during-publication.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.process_due_runmusic();
SQL
DURING_PUBLICATION=$!
if psql -X -v ON_ERROR_STOP=1 -q -v owner="$LOSER_ID" >"$ARTIFACT_DIR/loser-contact.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.submit_owned_runmusic_v2(:'owner'::uuid,'{"action":"save_contact","requestKey":"cb000000-0000-4000-8000-000000000007","ciphertext":"late","masked":"l***","fingerprint":"late"}');
SQL
then echo 'loser contact reinserted after publication' >&2;exit 1;fi
wait "$HOLDER"
grep -Fq RUNMUSIC_CLOSED "$ARTIFACT_DIR/loser-contact.log"
wait "$DURING_PUBLICATION"
for i in 1 2;do
 psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/draw-$i.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
select public.process_due_runmusic();
SQL
 eval "DRAW_$i=$!"
done
wait "$DRAW_1";wait "$DRAW_2"
# Account deletion and contact writes share the advisory owner lock.
PGAPPNAME=runmusic_delete_holder psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/deletion-holder.log" 2>&1 <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtextextended('fan-web-user:cb000000-0000-4000-8001-000000000001',0));
update public.app_users set status='disabled' where id='cb000000-0000-4000-8001-000000000001';
select pg_sleep(3);
commit;
SQL
HOLDER=$!
wait_holder runmusic_delete_holder
if psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/deletion-contact.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.submit_owned_runmusic_v2('cb000000-0000-4000-8001-000000000001','{"action":"save_contact","requestKey":"cb000000-0000-4000-8000-000000000008","ciphertext":"late","masked":"l***","fingerprint":"late"}');
SQL
then echo 'deleted owner saved contact' >&2;exit 1;fi
wait "$HOLDER"
grep -Fq FAN_WEB_ACTIVE_ACCOUNT_REQUIRED "$ARTIFACT_DIR/deletion-contact.log"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/assertions.log" 2>&1 <<'SQL'
do $$begin
 if (select count(*) from public.runmusic_draw_entries)<>166 then raise exception 'entry deduplication';end if;
 if (select count(distinct draw_id) from public.runmusic_draw_entries)<>1 then raise exception 'duplicate draw';end if;
 if (select count(*) from public.runmusic_draw_entries where winner)<>165 then raise exception 'winner allocation';end if;
 if exists(select 1 from public.runmusic_contacts x join public.runmusic_draw_entries e using(app_user_id) where not e.winner) then raise exception 'loser contact survived';end if;
 if exists(select 1 from public.runmusic_contacts where app_user_id='cb000000-0000-4000-8001-000000000001') then raise exception 'deleted owner contact survived';end if;
 if (select count(*) from public.runmusic_requests where request_key='cb000000-0000-4000-8000-000000000005')<>1 then raise exception 'request replay duplicated';end if;
 if (select count(*) from public.fan_notifications where kind='runmusic_result')<>166 then raise exception 'result notification deduplication';end if;
end $$;
drop trigger runmusic_test_fixed_seed on public.runmusic_campaign;
drop function public.runmusic_test_fixed_seed();
SQL

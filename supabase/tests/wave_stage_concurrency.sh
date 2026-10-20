#!/usr/bin/env bash
set -euo pipefail
# The SQL suite rolls back its draw, so this starts from the upgraded pair.
ACTOR=92900000-0000-4000-8000-000000000001
ADMIN=92900000-0000-4000-8000-000000000002
KEY1=93900000-0000-4000-8000-000000000001
KEY2=93900000-0000-4000-8000-000000000002
OUTPUT_DIR="$(mktemp -d)"
wait_for_sleep() {
 local ready=false
 for _ in $(seq 1 60); do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
  sleep 0.1
 done
 [[ "$ready" == true ]]
}
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare owner_id uuid:=md5('wave-stage-fixture:1')::uuid; creator uuid; quiz uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid(); pass uuid:=gen_random_uuid(); passport uuid:=gen_random_uuid(); job uuid:=gen_random_uuid();
begin
 select celebrity_id into creator from public.live_events where id='fde5ff1b-ac41-4c20-902b-034cba972023';
 insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values(quiz,creator,998,'draft',null);
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values(attempt,owner_id,creator,quiz,998,gen_random_uuid(),'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(pass,owner_id,creator,attempt);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(owner_id,91342,'0xf100000000000000000000000000000000000001','privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
 values(job,'passport',passport,'byus:passport:v1:'||owner_id||':'||(select slug from public.celebrities where id=creator),1,jsonb_build_object('recipient','0xf100000000000000000000000000000000000001','celebritySlug',(select slug from public.celebrities where id=creator),'passportId','0x'||repeat('1',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(passport,owner_id,creator,pass,job);
end $$;
SQL
# A reservation which already holds LIVE must commit before the common cutoff is captured.
PGAPPNAME=wave_stage_reservation_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' >"$OUTPUT_DIR/reservation" 2>&1 &
begin;
select 1 from public.live_events where id='fde5ff1b-ac41-4c20-902b-034cba972023' for update;
insert into public.live_reservations(app_user_id,live_event_id,celebrity_id,passport_id,idempotency_key,reserved_at) select md5('wave-stage-fixture:1')::uuid,live.id,live.celebrity_id,passport.id,gen_random_uuid(),clock_timestamp() from public.live_events live join public.fan_passports passport on passport.celebrity_id=live.celebrity_id and passport.app_user_id=md5('wave-stage-fixture:1')::uuid where live.id='fde5ff1b-ac41-4c20-902b-034cba972023';
select pg_sleep(2);
commit;
SQL
HOLDER=$!
wait_for_sleep wave_stage_reservation_holder
# The first draw is waiting on LIVE; another key must serialize behind it and conflict.
PGAPPNAME=wave_stage_first_draw psql -X -v ON_ERROR_STOP=1 -Atq -c "select public.execute_admin_wave_stage_draw('$ACTOR','$ADMIN','$KEY1','$KEY1',5,5);" >"$OUTPUT_DIR/first" 2>&1 &
FIRST=$!
psql -X -v ON_ERROR_STOP=1 -Atq -c "select public.execute_admin_wave_stage_draw('$ACTOR','$ADMIN','$KEY2','$KEY2',5,5);" >"$OUTPUT_DIR/second" 2>&1 &
SECOND=$!
wait "$HOLDER"
FIRST_STATUS=0; SECOND_STATUS=0
wait "$FIRST" || FIRST_STATUS=$?
wait "$SECOND" || SECOND_STATUS=$?
if [[ "$FIRST_STATUS" == 0 && "$SECOND_STATUS" != 0 ]]; then grep -q FAN_WEB_CONFLICT "$OUTPUT_DIR/second";
elif [[ "$SECOND_STATUS" == 0 && "$FIRST_STATUS" != 0 ]]; then grep -q FAN_WEB_CONFLICT "$OUTPUT_DIR/first";
else cat "$OUTPUT_DIR/first" "$OUTPUT_DIR/second"; echo 'Expected exactly one successful draw' >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 if (select count(*) from public.wave_stage_draws)<>1 then raise exception 'Duplicate stage pair'; end if;
 if (select count(*) from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'))<>2 then raise exception 'Partial stage draw'; end if;
 if not exists(select 1 from public.benefit_draw_candidates where campaign_id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb' and app_user_id=md5('wave-stage-fixture:1')::uuid and weight=2) then raise exception 'Reservation blocked on LIVE was excluded'; end if;
 if exists(select 1 from public.benefit_draws d join public.live_reservations r on r.live_event_id='fde5ff1b-ac41-4c20-902b-034cba972023' and r.app_user_id=md5('wave-stage-fixture:1')::uuid where d.campaign_id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb' and d.executed_at<r.reserved_at) then raise exception 'Captured cutoff before LIVE lock'; end if;
end $$;
SQL
printf 'Wave stage concurrent keys and reservation-lock cutoff passed\n'

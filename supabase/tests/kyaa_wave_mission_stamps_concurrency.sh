#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Fixture SQL explicitly rejects any non-disposable database before these writes.
sed '/^-- Wallet creation remains independent/,$d; s/^rollback;$/commit;/' "$ROOT_DIR/supabase/tests/kyaa_wave_mission_stamps.sql" | psql -X -v ON_ERROR_STOP=1 -q
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values('91d00000-0000-4000-8000-000000000002',91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','privy','embedded');
SQL
# The first grant holds the owner/draw locks while the other request arrives.
PGAPPNAME=wave_bingo_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.grant_admin_kyaa_wave_bingo_stamp('91d00000-0000-4000-8000-000000000003','91d00000-0000-4000-8000-000000000003',(select id from public.kyaa_wave_participants where app_user_id='91d00000-0000-4000-8000-000000000002'),extensions.gen_random_uuid());
select pg_sleep(2);
commit;
SQL
holder=$!
ready=false
for _ in {1..50}; do
 if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='wave_bingo_holder' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
 sleep 0.1
done
[[ "$ready" == true ]] || { echo 'Bingo concurrency checkpoint missing' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
select public.grant_admin_kyaa_wave_bingo_stamp('91d00000-0000-4000-8000-000000000003','91d00000-0000-4000-8000-000000000003',(select id from public.kyaa_wave_participants where app_user_id='91d00000-0000-4000-8000-000000000002'),extensions.gen_random_uuid());
SQL
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ declare participant uuid; stamp_count bigint; result jsonb; admin_id uuid:='91d00000-0000-4000-8000-000000000003'; begin
 select id into participant from public.kyaa_wave_participants where app_user_id='91d00000-0000-4000-8000-000000000002';
 assert (select count(*) from public.kyaa_wave_mission_completions where participant_id=participant and mission_key='bingo')=1;
 assert (select count(*) from public.community_stamps s join public.kyaa_wave_mission_completions c on s.source_key='wave-mission:'||c.id::text where c.participant_id=participant and c.mission_key='bingo')=1,'parallel grant creates one stamp';
 assert (select count(*) from public.audit_logs where action='kyaa_wave.bingo_stamp_granted' and entity_id=participant::text)=1;
 result:=public.save_owned_kyaa_wave_draw_preferences('91d00000-0000-4000-8000-000000000001',array['camera','meal','blue'],extensions.gen_random_uuid());
 result:=public.execute_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),extensions.gen_random_uuid());
 -- An existing bingo replay remains safe after the draw; a new quiz is rejected.
 result:=public.grant_admin_kyaa_wave_bingo_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
 begin
  perform public.grant_admin_kyaa_wave_quiz_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
  raise exception 'closed draw accepted new quiz';
 exception when others then if sqlerrm<>'FAN_WEB_CONFLICT' then raise; end if; end;
 -- The same close guard applies to a fresh bingo participant.
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values(admin_id,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',repeat('c',64)) returning id into participant;
 begin
  perform public.grant_admin_kyaa_wave_bingo_stamp(admin_id,admin_id,participant,extensions.gen_random_uuid());
  raise exception 'closed draw accepted new bingo';
 exception when others then if sqlerrm<>'FAN_WEB_CONFLICT' then raise; end if; end;
end $$;
SQL
if [[ -n "${BYUS_WAVE_MISSION_SNAPSHOT_FILE:-}" ]]; then
 psql -X -At -v ON_ERROR_STOP=1 -c "select outbox.source_snapshot from public.community_stamps stamp join public.fan_action_outbox outbox on outbox.id=stamp.fan_action_outbox_id where stamp.kind='wave_mission' order by stamp.issued_at,stamp.id limit 1" > "$BYUS_WAVE_MISSION_SNAPSHOT_FILE"
fi
echo 'WAVE mission stamps concurrency and draw-close assertions passed'

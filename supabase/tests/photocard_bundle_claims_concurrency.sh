#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bash "$ROOT_DIR/supabase/tests/wave_stage_concurrency.sh"
OUTPUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUTPUT_DIR"' EXIT
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.cheer_photocard_bundles(collection_id,title,position) select c.id,'Concurrent '||n,n from public.cheer_photocard_collections c cross join generate_series(0,3) n where distribution_mode<>'all';
insert into public.cheer_photocard_assets(collection_id,bundle_id,storage_path,width,height,content_type,position)
select b.collection_id,b.id,'concurrent-test/'||b.id||'/'||n||'.webp',1200,1600,'image/webp',b.position*3+n from public.cheer_photocard_bundles b join public.cheer_photocard_collections c on c.id=b.collection_id cross join generate_series(0,2) n where c.distribution_mode='random_three' or n<2;
SQL
# Hold the entitlement until both competing clients have started.
for mode in member_pair random_three; do
 PGAPPNAME=photocard_claim_holder psql -X -v ON_ERROR_STOP=1 -q -c "begin; select e.id from public.cheer_photocard_entitlements e join public.cheer_photocard_collections c on c.campaign_id=e.campaign_id where c.distribution_mode='$mode' and e.app_user_id=md5('wave-stage-fixture:1')::uuid for update of e; select pg_sleep(2); commit;" >"$OUTPUT_DIR/holder" 2>&1 &
 HOLDER=$!
 READY=false
 for _ in $(seq 1 60); do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='photocard_claim_holder' and wait_event='PgSleep')")" == t ]]; then READY=true; break; fi
  sleep 0.1
 done
 [[ "$READY" == true ]]
 for position in 0 1; do
  psql -X -v ON_ERROR_STOP=1 -Atq -c "select public.claim_cheer_photocard_bundle(md5('wave-stage-fixture:1')::uuid,c.id,case when c.distribution_mode='member_pair' then b.id else null end) from public.cheer_photocard_collections c join public.cheer_photocard_bundles b on b.collection_id=c.id and b.position=$position where c.distribution_mode='$mode';" >"$OUTPUT_DIR/$position" 2>&1 &
  if [[ "$position" == 0 ]]; then FIRST=$!; else SECOND=$!; fi
 done
 wait "$HOLDER"
 FIRST_STATUS=0; SECOND_STATUS=0
 wait "$FIRST" || FIRST_STATUS=$?
 wait "$SECOND" || SECOND_STATUS=$?
 if [[ "$mode" == member_pair ]]; then
  if [[ "$FIRST_STATUS" == 0 && "$SECOND_STATUS" != 0 ]]; then grep -q PHOTOCARD_ALREADY_CLAIMED "$OUTPUT_DIR/1";
  elif [[ "$SECOND_STATUS" == 0 && "$FIRST_STATUS" != 0 ]]; then grep -q PHOTOCARD_ALREADY_CLAIMED "$OUTPUT_DIR/0";
  else cat "$OUTPUT_DIR/0" "$OUTPUT_DIR/1"; exit 1; fi
 else
  [[ "$FIRST_STATUS" == 0 && "$SECOND_STATUS" == 0 ]]
  cmp "$OUTPUT_DIR/0" "$OUTPUT_DIR/1"
 fi
done
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ declare c record; claimed jsonb; replay jsonb;
begin
 for c in select * from public.cheer_photocard_collections where distribution_mode<>'all' loop
  claimed:=public.read_cheer_photocard_claim(md5('wave-stage-fixture:1')::uuid,c.id);
  replay:=public.claim_cheer_photocard_bundle(md5('wave-stage-fixture:1')::uuid,c.id,case when c.distribution_mode='member_pair' then (claimed->>'selectedBundleId')::uuid else null end);
  if claimed<>replay or jsonb_array_length(claimed->'assets')<>(case when c.distribution_mode='member_pair' then 2 else 3 end) then raise exception 'Concurrent claim changed on retry'; end if;
 end loop;
end $$;
SQL
printf 'Photocard concurrent member selection, random replay and lost response recovery passed\n'

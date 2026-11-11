#!/usr/bin/env bash
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/sns_ingest.sql
SNS_INGEST_LOCAL_PG=1 npm run test --workspace @byus/web -- --maxWorkers=3 server/sns-ingest/service.local-db.test.ts
# Two independent connections race to claim the same new slug.
race_dir=$(mktemp -d)
trap 'rm -rf "$race_dir"' EXIT
for worker in 1 2; do
  psql -XAtq -v ON_ERROR_STOP=1 -c "select public.sns_ingest_save_draft(public.sns_ingest_begin_run('fa400000-0000-4000-8000-0000000005a1','instagram','https://www.instagram.com/ingest.local/',gen_random_uuid(),null),'instagram-abcdef0123456789','https://www.instagram.com/ingest.local/p/RACE/',now(),'원문','{\"type\":\"doc\",\"content\":[]}')->>'status'" > "$race_dir/$worker" &
  eval "pid$worker=\$!"
done
wait "$pid1"
wait "$pid2"
actual=$(cat "$race_dir/1" "$race_dir/2" | sort | tr '\n' ' ')
[ "$actual" = 'created held ' ] || { echo "unexpected claim results: $actual"; exit 1; }
echo 'SNS concurrent claim: one created, one held'
# Same raw source observed by two connections creates only one source revision.
for worker in 1 2; do
  psql -XAtq -v ON_ERROR_STOP=1 -c "select public.sns_ingest_record_source(public.sns_ingest_begin_run('fa400000-0000-4000-8000-0000000005a1','instagram','https://www.instagram.com/ingest.local/',gen_random_uuid(),null),(select id from public.celebrity_notices where celebrity_id='fa400000-0000-4000-8000-0000000005a1' and slug='instagram-abcdef0123456789'),'{\"sourceUrl\":\"https://www.instagram.com/ingest.local/p/RACE/\",\"text\":\"원문\",\"images\":[]}')->>'status'" > "$race_dir/source-$worker" &
  eval "pid$worker=\$!"
done
wait "$pid1"
wait "$pid2"
actual=$(cat "$race_dir/source-1" "$race_dir/source-2" | sort | tr '\n' ' ')
[ "$actual" = 'recorded unchanged ' ] || { echo "unexpected source revision results: $actual"; exit 1; }
echo 'SNS concurrent raw source: one recorded revision, one unchanged'

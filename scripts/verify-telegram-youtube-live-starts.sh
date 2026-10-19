#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${PGHOST:-}" ]]; then
  export BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/telegram_youtube_live_starts.sql"
  export BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-telegram-youtube-live-starts.sh"
  exec bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
fi

# This connection is supplied by the disposable clean-migration harness only.
[[ "${PGDATABASE:-}" == "byus_clean" && "$PGHOST" == *byus-clean-db.*/* ]]
for regression in telegram_alert_lifecycle telegram_fan_activity_details; do
  psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/$regression.sql"
done
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
select public.configure_telegram_alerts('-1001234567890',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
  values('fa400000-0000-4000-8000-000000000031','telegram-live-concurrent','published','/images/creator.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
  values('fa400000-0000-4000-8000-000000000031','ko','동시 감지 최애','소개','사진'),
    ('fa400000-0000-4000-8000-000000000031','en','Concurrent creator','Introduction','Photo');
insert into public.celebrity_social_links(celebrity_id,platform,url)
  values('fa400000-0000-4000-8000-000000000031','youtube','https://www.youtube.com/@test-concurrent');
commit;
SQL

psql -X -q -v ON_ERROR_STOP=1 <<'SQL' &
begin;
select public.capture_telegram_youtube_live_starts(jsonb_build_array(
  jsonb_build_object('celebrity_slug','telegram-live-concurrent','video_id','conDEF123_-','observed_at',clock_timestamp())));
select pg_sleep(1);
commit;
SQL
first_pid=$!
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
select public.capture_telegram_youtube_live_starts(jsonb_build_array(
  jsonb_build_object('celebrity_slug','telegram-live-concurrent','video_id','conDEF123_-','observed_at',clock_timestamp())));
SQL
wait "$first_pid"

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if (select count(*) from public.telegram_youtube_live_starts where video_id='conDEF123_-')<>1
    or (select count(*) from public.telegram_alert_outbox o join public.telegram_youtube_live_starts s
      on s.id=o.source_id where s.video_id='conDEF123_-')<>1 then
    raise exception 'concurrent observations duplicated a broadcast';
  end if;
end $$;
SQL
echo "Telegram YouTube broadcast dedupe, concurrent capture and existing delivery regressions passed."

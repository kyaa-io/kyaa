#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_MOBILE_CONTENT_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55442}" \
  BYUS_MOBILE_CONTENT_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261017000000_mobile_content.sql" \
  BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_content_upgrade_before.sql" \
  BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_content_upgrade_after.sql" \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_content.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-content.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then echo "Mobile content concurrency check requires disposable database" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email)values('77200000-0000-4000-8000-000000000001','did:privy:content-race','content-race@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values('77200000-0000-4000-8000-000000000002','content-race','draft','/race.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('77200000-0000-4000-8000-000000000002','ko','경쟁','설명','경쟁'),('77200000-0000-4000-8000-000000000002','en','Race','Summary','Race');
update public.celebrities set status='published',published_at=clock_timestamp()where id='77200000-0000-4000-8000-000000000002';
insert into public.celebrity_quizzes(id,celebrity_id,version,status)values('77200000-0000-4000-8000-000000000003','77200000-0000-4000-8000-000000000002',1,'draft');
insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values('77200000-0000-4000-8000-000000000004','77200000-0000-4000-8000-000000000001','77200000-0000-4000-8000-000000000002','77200000-0000-4000-8000-000000000003',1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values('77200000-0000-4000-8000-000000000005','77200000-0000-4000-8000-000000000001','77200000-0000-4000-8000-000000000002','77200000-0000-4000-8000-000000000004');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values('77200000-0000-4000-8000-000000000009','passport','77200000-0000-4000-8000-000000000006','mobile-content-race-passport','{}');
alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values('77200000-0000-4000-8000-000000000006','77200000-0000-4000-8000-000000000001','77200000-0000-4000-8000-000000000002','77200000-0000-4000-8000-000000000005','77200000-0000-4000-8000-000000000009');
alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;
select public.reserve_owned_mobile_media('77200000-0000-4000-8000-000000000001','image','fan_clip','image/jpeg',100,'77200000-0000-4000-8000-000000000007');
select public.queue_owned_mobile_media_validation('77200000-0000-4000-8000-000000000001',(select id from public.mobile_media_assets where request_id='77200000-0000-4000-8000-000000000007'));
do $$declare a uuid;j jsonb;begin select id into a from public.mobile_media_assets where request_id='77200000-0000-4000-8000-000000000007';j:=public.claim_mobile_media_validation(a);perform public.finish_mobile_media_validation(a,(j->>'assetVersion')::integer,(j->>'jobId')::uuid,'image/jpeg',100,100,null);end$$;
SQL
create_clip() { psql -X -v ON_ERROR_STOP=1 -qAt -c "select public.create_mobile_content_fan_clip('77200000-0000-4000-8000-000000000001','content-race','race','public',array[(select id from public.mobile_media_assets where request_id='77200000-0000-4000-8000-000000000007')],'77200000-0000-4000-8000-000000000008')->>'id'"; }
create_clip >"$PGHOST/clip-a" & first=$!; create_clip >"$PGHOST/clip-b" & second=$!; wait "$first"; wait "$second"
test "$(sort -u "$PGHOST/clip-a" "$PGHOST/clip-b" | wc -l | tr -d ' ')" -eq 1
test "$(psql -X -v ON_ERROR_STOP=1 -qAt -c "select count(*) from public.fan_clips where app_user_id='77200000-0000-4000-8000-000000000001'")" = "1"
echo "PASS: concurrent clip retries created one clip"

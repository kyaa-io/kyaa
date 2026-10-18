#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_MOBILE_SOCIAL_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55437}" \
  BYUS_MOBILE_SOCIAL_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261013000000_mobile_social.sql" \
  BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_social_upgrade_before.sql" \
  BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_social_upgrade_after.sql" \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_social.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-social.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then echo "Social concurrency check requires disposable database" >&2; exit 1; fi
psql -X -v ON_ERROR_STOP=1 -q -f "$ROOT_DIR/supabase/tests/mobile_outbound_analytics.sql"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email) values
('73000000-0000-4000-8000-000000000001','did:privy:social-race-a','social-race-a@example.test'),
('73000000-0000-4000-8000-000000000002','did:privy:social-race-b','social-race-b@example.test');
insert into public.social_profile_settings(app_user_id,profile_visible,dm_policy) values
('73000000-0000-4000-8000-000000000001',true,'requests'),
('73000000-0000-4000-8000-000000000002',true,'requests');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values
('73000000-0000-4000-8000-000000000010','social-race','draft','/social-race.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
('73000000-0000-4000-8000-000000000010','ko','소셜 경합','소개','소셜'),
('73000000-0000-4000-8000-000000000010','en','Social race','Summary','Social');
update public.celebrities set status='published',published_at=now() where id='73000000-0000-4000-8000-000000000010';
insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,accepted_at) values
('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000010','accepted','74000000-0000-4000-8000-000000000010','race',now());
SQL
race_request() {
  local actor="$1" target="$2" request_id="$3" output
  if ! output="$(psql -X -v ON_ERROR_STOP=1 -qAt -c "select public.request_social_dm('$actor'::uuid,'$target'::uuid,'hello'::text,'$request_id'::uuid)" 2>&1)"; then
    grep -q SOCIAL_CONFLICT <<<"$output" || { printf '%s\n' "$output" >&2; return 1; }
  fi
}
race_request 73000000-0000-4000-8000-000000000001 73000000-0000-4000-8000-000000000002 74000000-0000-4000-8000-000000000001 & first=$!
race_request 73000000-0000-4000-8000-000000000002 73000000-0000-4000-8000-000000000001 74000000-0000-4000-8000-000000000002 & second=$!
wait "$first"; wait "$second"
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' | grep -qx 1
select count(*) from public.social_dm_conversations where user_low_id='73000000-0000-4000-8000-000000000001' and user_high_id='73000000-0000-4000-8000-000000000002';
SQL
echo "PASS: concurrent opposite DM requests produced one conversation"

#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${BYUS_MOBILE_BENEFITS_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55439}" \
  BYUS_MOBILE_BENEFITS_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_UPGRADE_MIGRATION="20261016000000_mobile_benefits.sql" \
  BYUS_CLEAN_DB_UPGRADE_BEFORE_FILE="$ROOT_DIR/supabase/tests/mobile_benefits_upgrade_before.sql" \
  BYUS_CLEAN_DB_UPGRADE_AFTER_FILE="$ROOT_DIR/supabase/tests/mobile_benefits_upgrade_after.sql" \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_benefits.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-benefits.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?Disposable database socket required}"
: "${PGPORT:?Disposable database port required}"
: "${PGDATABASE:?Disposable database name required}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then echo "Mobile benefit race check refuses non-disposable PostgreSQL targets" >&2; exit 1; fi

psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email) values('58000000-0000-4000-8000-000000000011','did:privy:mobile-benefit-race','mobile-benefit-race@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values('58000000-0000-4000-8000-000000000012','mobile-benefit-race','draft','/test.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('58000000-0000-4000-8000-000000000012','ko','모바일 경합','설명','이미지'),('58000000-0000-4000-8000-000000000012','en','Mobile race','Summary','Image');
update public.celebrities set status='published',published_at=now() where id='58000000-0000-4000-8000-000000000012';
insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at) values('58000000-0000-4000-8000-000000000013','mobile-benefit-race-prize','58000000-0000-4000-8000-000000000012','draft','text',now()-interval '1 hour',now()+interval '2 hours');
insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label) values('58000000-0000-4000-8000-000000000013','ko','경합 경품','설명','응모권 1장','디지털'),('58000000-0000-4000-8000-000000000013','en','Race prize','Summary','One ticket','Digital');
insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values('58000000-0000-4000-8000-000000000013','text','test delivery');
update public.benefits set publication_status='published',published_at=now() where id='58000000-0000-4000-8000-000000000013';
insert into public.mobile_store_sandbox_testers(app_user_id,enabled) values('58000000-0000-4000-8000-000000000011',true);
insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,enabled,opens_at,closes_at) values('58000000-0000-4000-8000-000000000014','58000000-0000-4000-8000-000000000013','instant_draw','race-v1',1,false,now()-interval '1 hour',now()+interval '1 hour');
insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method) values('58000000-0000-4000-8000-000000000015','58000000-0000-4000-8000-000000000014','won',1,1,'digital');
update public.mobile_benefit_policies set enabled=true where id='58000000-0000-4000-8000-000000000014';
select public.post_fan_ticket_entry('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000012','credit',1,'mobile_benefit_race','58000000-0000-4000-8000-000000000016','58000000-0000-4000-8000-000000000017',(select version from public.reward_policy_versions order by version desc limit 1),null,null);
SQL
draw() { psql -X -v ON_ERROR_STOP=1 -qAt -c "select public.draw_owned_mobile_benefit('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000013','58000000-0000-4000-8000-000000000018','race-v1',now())" >/dev/null; }
draw & first=$!; draw & second=$!; wait "$first"; wait "$second"
psql -X -v ON_ERROR_STOP=1 -qAt -c "do \$\$ begin if (select count(*) from public.mobile_benefit_draw_requests where id='58000000-0000-4000-8000-000000000018')<>1 or (select inventory_awarded from public.mobile_benefit_instant_prizes where id='58000000-0000-4000-8000-000000000015')<>1 then raise exception 'Concurrent draw duplicated result'; end if; end \$\$;"
echo "PASS: concurrent instant draw produced one debit and one inventory award"

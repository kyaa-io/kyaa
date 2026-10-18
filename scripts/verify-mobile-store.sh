#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${BYUS_MOBILE_STORE_ASSERTION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55435}" \
  BYUS_MOBILE_STORE_ASSERTION_MODE=1 \
  BYUS_CLEAN_DB_ASSERTION_FILE="$ROOT_DIR/supabase/tests/mobile_store.sql" \
  BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/scripts/verify-mobile-store.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi

: "${PGHOST:?Disposable database socket required}"
: "${PGPORT:?Disposable database port required}"
: "${PGDATABASE:?Disposable database name required}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Mobile Store race check refuses non-disposable PostgreSQL targets" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email) values('57000000-0000-4000-8000-000000000011','did:privy:mobile-store-race','mobile-store-race@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values('57000000-0000-4000-8000-000000000012','mobile-store-race','draft','/test.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('57000000-0000-4000-8000-000000000012','ko','스토어 테스트','스토어 동시성 테스트','테스트'),
  ('57000000-0000-4000-8000-000000000012','en','Store Test','Store concurrency test','Test');
update public.celebrities set status='published',published_at=now() where id='57000000-0000-4000-8000-000000000012';
insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)values('57000000-0000-4000-8000-000000000014','mobile-store-race-benefit','57000000-0000-4000-8000-000000000012','draft','text',now()-interval'1 hour',now()+interval'2 hours');
insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)values('57000000-0000-4000-8000-000000000014','ko','경합 경품','설명','응모권','디지털'),('57000000-0000-4000-8000-000000000014','en','Race benefit','Summary','Tickets','Digital');
insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value)values('57000000-0000-4000-8000-000000000014','text','race delivery');update public.benefits set publication_status='published',published_at=now()where id='57000000-0000-4000-8000-000000000014';
insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,allow_paid_tickets,enabled,tester_only,opens_at,closes_at)values('57000000-0000-4000-8000-000000000015','57000000-0000-4000-8000-000000000014','instant_draw','race-paid-v1',1,true,false,false,now()-interval'1 hour',now()+interval'1 hour');
insert into public.mobile_benefit_instant_prizes(id,policy_id,outcome,weight,inventory_limit,fulfillment_method)values('57000000-0000-4000-8000-000000000016','57000000-0000-4000-8000-000000000015','won',1,10,'digital');update public.mobile_benefit_policies set enabled=true where id='57000000-0000-4000-8000-000000000015';
insert into public.mobile_store_sandbox_testers(app_user_id,enabled) values('57000000-0000-4000-8000-000000000011',true);
insert into public.mobile_store_product_policies(store,environment,product_id,policy_version,currency,ticket_quantity,support_rate_bps,reward_policy_version,effective_at)
select 'apple','sandbox','kr.byus.ticket.race','race-v1','KRW',10,1000,version,now()-interval '1 minute' from public.reward_policy_versions order by version desc limit 1;
select public.mobile_store_create_intent('57000000-0000-4000-8000-000000000011','apple','kr.byus.ticket.race','mobile-store-race','race-v1','57000000-0000-4000-8000-000000000014','race-paid-v1','57000000-0000-4000-8000-000000000013');
SQL

apply_purchase() {
  psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL' >/dev/null
set statement_timeout='8s';
select public.mobile_store_apply_owned_verified_transaction('57000000-0000-4000-8000-000000000011','apple','sandbox','race-transaction',(select profile_id from public.mobile_store_intent_profiles where app_user_id='57000000-0000-4000-8000-000000000011'),'kr.byus.ticket.race','KRW',1000,0,'purchased',repeat('a',64),now());
SQL
}
apply_purchase & first_pid=$!
apply_purchase & second_pid=$!
wait "$first_pid"
wait "$second_pid"

psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if (select count(*) from public.mobile_store_transactions where external_transaction_id='race-transaction')<>1 then raise exception 'Concurrent verification duplicated transaction'; end if;
  if (select count(*) from public.mobile_store_paid_ticket_ledger where app_user_id='57000000-0000-4000-8000-000000000011')<>1 then raise exception 'Concurrent verification duplicated paid grant'; end if;
  if exists(select 1 from public.fan_ticket_ledger where app_user_id='57000000-0000-4000-8000-000000000011') then raise exception 'Paid grant entered physical-benefit ledger'; end if;
end $$;
SQL
echo "PASS: concurrent Store verification produced one paid grant"

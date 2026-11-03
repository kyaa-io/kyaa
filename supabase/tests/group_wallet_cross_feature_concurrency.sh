#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$root/supabase/tests/group_wallet_cross_feature.sql"
logs="$(mktemp -d)"
cleanup() {
 local result=$?
 if [[ $result -ne 0 ]];then
  for output in "$logs/first" "$logs/second";do
   if [[ -f "$output" ]];then cat "$output" >&2;fi
  done
 fi
 rm -f "$logs/first" "$logs/second"
 rmdir "$logs"
}
trap cleanup EXIT
legacy() {
 psql -X -v ON_ERROR_STOP=1 >"$logs/$1" 2>&1 <<SQL
begin;
set local statement_timeout='8s';
set local application_name='cross-wallet-$1';
select public.enter_owned_benefit('e9500000-0000-4000-8000-000000000001','e9500000-0000-4000-8000-000000000005','$2',1,clock_timestamp());
select pg_sleep($3);
commit;
SQL
}
capsule() {
 psql -X -v ON_ERROR_STOP=1 >"$logs/$1" 2>&1 <<SQL
begin;
set local statement_timeout='8s';
set local application_name='cross-wallet-$1';
select public.group_capsule_dispatch('draw','e9500000-0000-4000-8000-000000000001',(select(value->>'capsule')::uuid from public.group_wallet_cross_fixture f where f.key='context'),jsonb_build_object('requestKey','$2','count',1));
select pg_sleep($3);
commit;
SQL
}
wait_for_debit() {
 for _ in {1..40};do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where datname=current_database()and wait_event='PgSleep'and query like 'select pg_sleep(1)%')")" == t ]];then return;fi
  sleep 0.05
 done
 echo 'Writer did not reach committed-operation hold' >&2;cat "$logs/first";return 1
}
wait_for_block() {
 for _ in {1..30};do
  if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where datname=current_database()and application_name='cross-wallet-second'and wait_event_type='Lock')")" == t ]];then return;fi
  sleep 0.02
 done
 echo 'Competing writer did not wait on the active transaction lock' >&2
 return 1
}
# Real legacy entry obtains the account lock; capsule must wait and fail.
legacy first e9500000-0000-4000-8000-000000000030 1 & first=$!
wait_for_debit
capsule second e9500000-0000-4000-8000-000000000031 0 & second=$!
wait_for_block
wait "$first" || { cat "$logs/first";exit 1; }
if wait "$second";then cat "$logs/second";exit 1;fi
grep -Eq 'INSUFFICIENT_BALANCE|NEGATIVE_BALANCE' "$logs/second"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin if public.group_wallet_balance('e9500000-0000-4000-8000-000000000001','ticket')<>0 then raise exception 'Legacy-first double spend';end if;end $$;
select public.group_wallet_post('e9500000-0000-4000-8000-000000000001','ticket',1,'group_exchange','e9500000-0000-4000-8000-000000000032');
SQL
# Reverse the winner: real capsule holds the account, legacy entry then fails.
capsule first e9500000-0000-4000-8000-000000000033 1 & first=$!
wait_for_debit
legacy second e9500000-0000-4000-8000-000000000034 0 & second=$!
wait_for_block
wait "$first" || { cat "$logs/first";exit 1; }
if wait "$second";then cat "$logs/second";exit 1;fi
grep -Eq 'INSUFFICIENT_BALANCE|NEGATIVE_BALANCE' "$logs/second"
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$declare ctx jsonb;owner uuid:='e9500000-0000-4000-8000-000000000001';actor uuid:='e9500000-0000-4000-8000-000000000002';admin uuid:='e9500000-0000-4000-8000-000000000003';snap jsonb;current_snap jsonb;before_points bigint;answer jsonb;again jsonb;raffle uuid;key uuid;input jsonb;begin
 select value into ctx from public.group_wallet_cross_fixture f where f.key='context';
 if public.group_wallet_balance(owner,'ticket')<>0 or(select count(*)from public.fan_ticket_ledger where app_user_id=owner and amount<0)<>2 then raise exception 'Cross-feature double spend or ledger duplication';end if;
 answer:=public.group_capsule_dispatch('draw',owner,(ctx->>'capsule')::uuid,'{"requestKey":"e9500000-0000-4000-8000-000000000033","count":1}');
 if jsonb_array_length(answer->'results')<>1 or public.group_wallet_balance(owner,'ticket')<>0 then raise exception 'Committed capsule retry changed debit';end if;
 update public.app_users set status='disabled'where id=owner;
 answer:=public.cancel_admin_benefit_campaign(actor,admin,extensions.gen_random_uuid(),(ctx->>'legacyCampaign')::uuid,(select revision from public.live_benefit_campaigns where id=(ctx->>'legacyCampaign')::uuid),'Fixture organizer cancellation');
 if public.group_wallet_balance(owner,'ticket')<>1 then raise exception 'Inactive legacy entrant lost cancellation refund';end if;
 perform public.cancel_admin_benefit_campaign(actor,admin,extensions.gen_random_uuid(),(ctx->>'legacyCampaign')::uuid,(select revision from public.live_benefit_campaigns where id=(ctx->>'legacyCampaign')::uuid),'Fixture organizer cancellation');
 if public.group_wallet_balance(owner,'ticket')<>1 then raise exception 'Legacy cancel replay double refund';end if;
 update public.app_users set status='active'where id=owner;
 input:=jsonb_build_object('requestId',extensions.gen_random_uuid(),'title','Cross cancellation','winnerQuantity',1,'perUserLimit',1,'closesAt',clock_timestamp()+interval'1 hour','submissionDays',7,'fulfillmentMethod','digital');
 raffle:=(public.group_raffle_dispatch('create',actor,(ctx->>'page')::uuid,null,input)->>'id')::uuid;
 perform public.group_raffle_dispatch('enter',owner,(ctx->>'page')::uuid,raffle,jsonb_build_object('requestId',extensions.gen_random_uuid(),'amount',1));
 update public.app_users set status='disabled'where id=owner;key:=extensions.gen_random_uuid();
 perform public.group_raffle_dispatch('cancel',actor,(ctx->>'page')::uuid,raffle,jsonb_build_object('requestId',key));
 perform public.group_raffle_dispatch('cancel',actor,(ctx->>'page')::uuid,raffle,jsonb_build_object('requestId',key));
 if public.group_wallet_balance(owner,'ticket')<>1 then raise exception 'Inactive group entrant refund lost or duplicated';end if;
 update public.app_users set status='active'where id=owner;
 before_points:=public.group_wallet_balance(owner,'fan_point');
 perform public.check_in_mobile_fan_support(owner,ctx->>'creatorSlug');perform public.check_in_mobile_fan_support(owner,'cross-wallet-second');
 answer:=public.check_in_owned_group_wallet(owner,extensions.gen_random_uuid());again:=public.check_in_owned_group_wallet(owner,extensions.gen_random_uuid());
 if public.group_wallet_balance(owner,'fan_point')<>before_points+10 or answer->>'streak'<>'1'or again->>'replayed'<>'true'then raise exception 'Multi-Creator daily sources duplicated global points';end if;
 select value into snap from public.group_wallet_cross_fixture f where f.key='paid_snapshot';
 current_snap:=jsonb_build_object('intents',(select jsonb_agg(to_jsonb(i)order by id)from public.mobile_vote_purchase_intents i where app_user_id=owner),'transactions',(select jsonb_agg(to_jsonb(t)order by t.id)from public.mobile_vote_transactions t join public.mobile_vote_purchase_intents i on i.id=t.intent_id where i.app_user_id=owner),'lots',(select jsonb_agg(to_jsonb(l)order by transaction_id)from public.mobile_vote_purchase_lots l where app_user_id=owner));
 if current_snap is distinct from snap then raise exception 'Global free-asset activity changed paid/pending/held rights';end if;
 if public.mobile_fan_economy_balance(owner,(ctx->>'creator')::uuid,'paid_vote')<>9 or public.mobile_fan_economy_balance(owner,(ctx->>'creator')::uuid,'free_vote')<>4 then raise exception 'Paid/vote currency changed';end if;
 raise notice 'PASS legacy entry vs capsule in both orders: serialized once, no overdraft, original receipt retry';
 raise notice 'PASS legacy and group organizer cancel: inactive users receive exactly one refund';
 raise notice 'PASS two Creator check-ins plus global check-in: one KST reward';
 raise notice 'PASS immutable pending/held paid rights remain byte-equivalent';
end $$;
SQL

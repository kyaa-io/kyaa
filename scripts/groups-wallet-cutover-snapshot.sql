-- Read-only, repeatable financial snapshot. Run only after writers have drained.
-- Compatible with the pre-200 schema; it does not reference new wallet tables.
begin isolation level repeatable read read only;
set local statement_timeout='120s';
with financial_rows as (
 select 'fan_ticket_ledger'::text relation,encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex') row_hash from public.fan_ticket_ledger x
 union all select 'mobile_fan_economy_ledger',encode(extensions.digest((to_jsonb(x)-'group_policy_version')::text,'sha256'),'hex')from public.mobile_fan_economy_ledger x
 union all select 'mobile_fan_economy_requests',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_fan_economy_requests x
 union all select 'mobile_fan_economy_cancellations',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_fan_economy_cancellations x
 union all select 'mobile_fan_economy_activity_receipts',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_fan_economy_activity_receipts x
 union all select 'mobile_vote_purchase_intents',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_vote_purchase_intents x
 union all select 'mobile_vote_transactions',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_vote_transactions x
 union all select 'mobile_vote_purchase_lots',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_vote_purchase_lots x
 union all select 'mobile_vote_lot_allocations',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_vote_lot_allocations x
 union all select 'mobile_vote_refund_steps',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_vote_refund_steps x
 union all select 'mobile_store_purchase_intents',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_store_purchase_intents x
 union all select 'mobile_store_intent_profiles',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_store_intent_profiles x
 union all select 'mobile_store_transactions',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_store_transactions x
 union all select 'mobile_store_paid_ticket_ledger',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_store_paid_ticket_ledger x
 union all select 'mobile_store_support_ledger',encode(extensions.digest(to_jsonb(x)::text,'sha256'),'hex')from public.mobile_store_support_ledger x
), fingerprints as (
 select relation,count(*)rows,encode(extensions.digest(string_agg(row_hash,''order by row_hash),'sha256'),'hex')sha256 from financial_rows group by relation
), assets as (
 select app_user_id,'ticket'::text asset,sum(amount::numeric)balance from public.fan_ticket_ledger group by app_user_id
 union all select app_user_id,asset,sum(amount::numeric)from public.mobile_fan_economy_ledger group by app_user_id,asset
), asset_summary as (
 select asset,count(*)owners,sum(balance)::text total,min(balance)::text minimum,count(*)filter(where balance<0)negative_owners,count(*)filter(where balance>9007199254740991)overflow_owners,
 encode(extensions.digest(string_agg(app_user_id::text||':'||balance::text,'|'order by app_user_id),'sha256'),'hex')owner_balance_sha256 from assets group by asset
), paid_lots as (
 select l.*,t.state,t.pending_reason from public.mobile_vote_purchase_lots l join public.mobile_vote_transactions t on t.id=l.transaction_id
)
select jsonb_build_object('schemaVersion',1,'observedAt',statement_timestamp(),'database',current_database(),'sessionUser',session_user,'serverAddress',host(inet_server_addr()),'serverPort',inet_server_port(),
 'fingerprints',coalesce((select jsonb_object_agg(relation,jsonb_build_object('rows',rows,'sha256',sha256))from fingerprints),'{}'),
 'assets',coalesce((select jsonb_object_agg(asset,jsonb_build_object('owners',owners,'total',total,'minimum',minimum,'negativeOwners',negative_owners,'overflowOwners',overflow_owners,'ownerBalanceSha256',owner_balance_sha256))from asset_summary),'{}'),
 'paidVotes',jsonb_build_object('availableUnits',coalesce((select sum(quantity-spent-reversed)::text from paid_lots where not refund_review and state='granted'and pending_reason is null),'0'),'heldUnits',coalesce((select sum(quantity-spent-reversed)::text from paid_lots where refund_review or state<>'granted'or pending_reason is not null),'0'),'pendingTransactions',(select count(*)from public.mobile_vote_transactions where state='pending'),'refundReviewLots',(select count(*)from paid_lots where refund_review),'invalidLots',(select count(*)from paid_lots where spent+reversed>quantity)));
commit;

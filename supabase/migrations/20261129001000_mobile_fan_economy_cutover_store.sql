begin;
-- Unapplied candidate only: expansion preserves each original reward producer.
create temporary table mobile_fan_legacy_producers on commit drop as
select oid,proname,prosrc,pg_get_functiondef(oid) definition from pg_proc
where pronamespace='public'::regnamespace and proname in(
 'award_fan_ticket_activity','reward_successful_quiz_pass','reward_live_reservation_ticket',
 'reward_live_attendance_ticket','award_mobile_content_first_clip','process_community_stamp_invitation_milestone',
 'finalize_certification_review_internal','submit_owned_live_mission_before_fan_web','evaluate_owned_live_journey',
 'get_owned_fan_ticket_activity','read_owned_mobile_benefit_free_ticket_missions');
create table public.mobile_fan_earning_cutovers (
 celebrity_id uuid primary key references public.celebrities(id),
 policy_id uuid not null unique references public.mobile_fan_economy_policies(id),
 effective_at timestamptz not null,version text not null
);
alter table public.mobile_fan_earning_cutovers enable row level security;
revoke all on public.mobile_fan_earning_cutovers from public,anon,authenticated,service_role;
create trigger mobile_fan_cutover_immutable before update or delete on public.mobile_fan_earning_cutovers for each row execute function public.reject_fan_ticket_ledger_mutation();
-- Later operator revisions cannot rewrite the contract of a delayed source.
create function public.guard_mobile_fan_earning_timeline() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.kind<>'earning' then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-earning-creator:'||new.celebrity_id,0));
 if tg_op='UPDATE' and (new.retired_at<statement_timestamp() or exists(select 1 from public.fan_ticket_activity_sources(null,new.celebrity_id) s where s.occurred_at>=new.retired_at and s.occurred_at>=old.effective_at)) then raise exception 'FAN_ECONOMY_POLICY_RETROACTIVE';end if;
 if tg_op='INSERT' and exists(select 1 from public.mobile_fan_earning_cutovers where celebrity_id=new.celebrity_id) and (new.effective_at<statement_timestamp() or exists(select 1 from public.fan_ticket_activity_sources(null,new.celebrity_id) s where s.occurred_at>=new.effective_at)) then raise exception 'FAN_ECONOMY_POLICY_RETROACTIVE';end if;
 if tg_op='INSERT' and exists(select 1 from public.mobile_fan_economy_policies p where p.celebrity_id=new.celebrity_id and p.kind='earning' and tstzrange(p.effective_at,p.retired_at,'[)') && tstzrange(new.effective_at,new.retired_at,'[)')) then raise exception 'FAN_ECONOMY_POLICY_OVERLAP';end if;
 return new;
end $$;
create trigger mobile_fan_earning_timeline before insert or update on public.mobile_fan_economy_policies for each row execute function public.guard_mobile_fan_earning_timeline();
revoke all on function public.guard_mobile_fan_earning_timeline() from public,anon,authenticated,service_role;
create function public.mobile_fan_source_uses_points(p_creator uuid,p_occurred_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mobile_fan_earning_cutovers where celebrity_id=p_creator and p_occurred_at>=effective_at)
$$;
-- Serialize before choosing either producer, with a fresh read after the wait.
-- Producers share the creator fence; activation/retirement take it exclusively.
-- No producer upgrades the upstream creator SHARE or FK KEY SHARE row locks.
create function public.mobile_fan_lock_reward_source(p_owner uuid,p_creator uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if p_owner is null or p_creator is null then return;end if;
 perform public.fan_web_lock_active_user(p_owner);
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('fan-earning-creator:'||p_creator,0));
end $$;
revoke all on function public.mobile_fan_lock_reward_source(uuid,uuid) from public,anon,authenticated,service_role;
create function public.activate_mobile_fan_earning(p_celebrity_id uuid,p_version text,p_rules jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare boundary timestamptz; policy uuid; prior public.mobile_fan_earning_cutovers%rowtype; action text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-earning-creator:'||p_celebrity_id,0));
 perform 1 from public.celebrities where id=p_celebrity_id and status='published' and archived_at is null for share;
 if not found then raise exception 'FAN_ECONOMY_FAVORITE_UNAVAILABLE';end if;
 select * into prior from public.mobile_fan_earning_cutovers where celebrity_id=p_celebrity_id;
 if found then
  if prior.version<>p_version or (select rules from public.mobile_fan_economy_policies where id=prior.policy_id) is distinct from p_rules then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
  return jsonb_build_object('policyId',prior.policy_id,'effectiveAt',prior.effective_at,'version',prior.version,'replayed',true);
 end if;
 if p_version is null or length(p_version) not between 1 and 80 or jsonb_typeof(p_rules) is distinct from 'object' then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 foreach action in array array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'] loop
  if coalesce(p_rules->>action,'') !~ '^(0|[1-9][0-9]*)$' or (p_rules->>action)::numeric>9007199254740991 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 end loop;
 boundary:=clock_timestamp();
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at) values(p_celebrity_id,p_version,'earning',p_rules,boundary) returning id into policy;
 insert into public.mobile_fan_earning_cutovers values(p_celebrity_id,policy,boundary,p_version);
 return jsonb_build_object('policyId',policy,'effectiveAt',boundary,'version',p_version,'replayed',false);
end $$;
revoke all on function public.mobile_fan_source_uses_points(uuid,timestamptz),public.activate_mobile_fan_earning(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.activate_mobile_fan_earning(uuid,text,jsonb) to service_role;

create table public.mobile_fan_economy_cancellations(app_user_id uuid not null references public.app_users(id),request_key uuid not null,operation text not null check(operation in('exchange','vote','vote_intent')),input jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(app_user_id,request_key));
alter table public.mobile_fan_economy_cancellations enable row level security;alter table public.mobile_fan_economy_cancellations force row level security;
revoke all on public.mobile_fan_economy_cancellations from public,anon,authenticated,service_role;
create trigger mobile_fan_economy_cancellations_immutable before update or delete on public.mobile_fan_economy_cancellations for each row execute function public.reject_fan_ticket_ledger_mutation();

-- A separate immutable entitlement: existing ticket SKUs/snapshots retain their meaning.
create table public.mobile_vote_product_policies (
 id uuid primary key default extensions.gen_random_uuid(),store text not null check(store in('apple','google')),product_id text not null,version text not null,
 vote_quantity bigint not null check(vote_quantity between 1 and 9007199254740991),currency text not null default 'KRW' check(currency='KRW'),effective_at timestamptz not null,retired_at timestamptz,
 unique(store,product_id,version)
);
create unique index mobile_vote_product_active on public.mobile_vote_product_policies(store,product_id)where retired_at is null;
create trigger mobile_vote_product_immutable before update or delete on public.mobile_vote_product_policies for each row execute function public.guard_mobile_store_product_policy_mutation();
create table public.mobile_vote_purchase_intents (
 id uuid primary key default extensions.gen_random_uuid(),app_user_id uuid not null references public.app_users(id),celebrity_id uuid not null references public.celebrities(id),
 request_key uuid not null,product_policy_id uuid not null references public.mobile_vote_product_policies(id),vote_policy_id uuid not null references public.mobile_fan_economy_policies(id),
 store text not null,product_id text not null,vote_quantity bigint not null,currency text not null,policy_version text not null,created_at timestamptz not null default clock_timestamp(),
 unique(app_user_id,request_key)
);
create trigger mobile_vote_intent_immutable before update or delete on public.mobile_vote_purchase_intents for each row execute function public.reject_fan_ticket_ledger_mutation();
create table public.mobile_vote_transactions (
 id uuid primary key default extensions.gen_random_uuid(),store text not null,environment text not null check(environment in('sandbox','production')),external_transaction_id text not null,
 intent_id uuid references public.mobile_vote_purchase_intents(id),product_id text not null,amount_krw bigint check(amount_krw between 1 and 9007199254740991),refunded_krw bigint not null default 0 check(refunded_krw between 0 and 9007199254740991),
 state text not null default 'pending' check(state in('pending','granted','revoked')),pending_reason text,verification_fingerprint text not null,store_event_at timestamptz,verified_at timestamptz not null default clock_timestamp(),
 unique(store,environment,external_transaction_id),unique(intent_id)
);
create table public.mobile_vote_purchase_lots (
 transaction_id uuid primary key references public.mobile_vote_transactions(id),app_user_id uuid not null references public.app_users(id),celebrity_id uuid not null references public.celebrities(id),
 quantity bigint not null check(quantity>0),spent bigint not null default 0 check(spent>=0),reversed bigint not null default 0 check(reversed>=0),refund_review boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),check(spent+reversed<=quantity)
);
create table public.mobile_vote_lot_allocations (vote_id uuid not null references public.mobile_fan_gift_votes(id),transaction_id uuid not null references public.mobile_vote_purchase_lots(transaction_id),quantity bigint not null check(quantity>0),primary key(vote_id,transaction_id));
create trigger mobile_vote_lot_allocations_immutable before update or delete on public.mobile_vote_lot_allocations for each row execute function public.reject_fan_ticket_ledger_mutation();
create table public.mobile_vote_refund_steps(transaction_id uuid not null references public.mobile_vote_transactions(id),refunded_krw bigint not null check(refunded_krw>0),reversed_units bigint not null check(reversed_units>=0),held_units bigint not null check(held_units>=0),ledger_id uuid references public.mobile_fan_economy_ledger(id),created_at timestamptz not null default clock_timestamp(),primary key(transaction_id,refunded_krw));
create trigger mobile_vote_refund_steps_immutable before update or delete on public.mobile_vote_refund_steps for each row execute function public.reject_fan_ticket_ledger_mutation();
create function public.mobile_vote_policy_ready(p_policy public.mobile_fan_economy_policies)returns boolean language sql immutable set search_path='' as $$
 select p_policy.kind='vote' and p_policy.rules->>'paidInfluenceVerified'='true' and length(coalesce(p_policy.rules->>'influenceAlgorithm',''))>0 and (p_policy.rules->>'maxPaidInfluenceBps')::integer between 0 and 2000 $$;
create function public.mobile_vote_intent_json(p_intent public.mobile_vote_purchase_intents,p_replayed boolean)returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('id',p_intent.id,'requestKey',p_intent.request_key,'celebrityId',p_intent.celebrity_id,'store',p_intent.store,'environment','sandbox','productId',p_intent.product_id,'currency',p_intent.currency,'voteQuantity',p_intent.vote_quantity,'policyVersion',p_intent.policy_version,'entitlementKind','paid_vote','appAccountToken',case when p_intent.store='apple'then p_intent.id else null end,'obfuscatedProfileId',case when p_intent.store='google'then p_intent.id else null end,'createdAt',p_intent.created_at,'replayed',p_replayed) $$;
create function public.read_owned_mobile_vote_products(p_app_user_id uuid,p_store text,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;policy public.mobile_fan_economy_policies%rowtype;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);if p_store not in('apple','google')then raise exception 'FAN_ECONOMY_INVALID';end if;
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='vote' and retired_at is null and effective_at<=clock_timestamp();
 if not found or public.mobile_vote_policy_ready(policy) is not true then return jsonb_build_object('policy',jsonb_build_object('status','unconfigured'),'products','[]'::jsonb);end if;
 if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled)then return jsonb_build_object('policy',jsonb_build_object('status','unconfigured'),'products','[]'::jsonb);end if;
 return jsonb_build_object('policy',jsonb_build_object('status','configured'),'products',coalesce((select jsonb_agg(jsonb_build_object('productId',product_id,'currency',currency,'voteQuantity',vote_quantity,'policyVersion',version,'entitlementKind','paid_vote')order by product_id)from public.mobile_vote_product_policies where store=p_store and retired_at is null and effective_at<=clock_timestamp()),'[]'));end $$;
create function public.create_owned_mobile_vote_intent(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_store text,p_product_id text,p_policy_version text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;prior public.mobile_vote_purchase_intents%rowtype;product public.mobile_vote_product_policies%rowtype;policy public.mobile_fan_economy_policies%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_store not in('apple','google')then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'vote_intent',jsonb_build_object('celebritySlug',p_celebrity_slug,'store',p_store,'productId',p_product_id,'policyVersion',p_policy_version));
 select * into prior from public.mobile_vote_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.store<>p_store or prior.product_id<>p_product_id or prior.policy_version<>p_policy_version or not exists(select 1 from public.celebrities where id=prior.celebrity_id and slug=p_celebrity_slug)then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return public.mobile_vote_intent_json(prior,true);end if;
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='vote' and retired_at is null and effective_at<=clock_timestamp();
 if not found or public.mobile_vote_policy_ready(policy) is not true then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled)then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 select * into product from public.mobile_vote_product_policies where store=p_store and product_id=p_product_id and retired_at is null and effective_at<=clock_timestamp();if not found then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if product.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 -- A SKU can never be reinterpreted from legacy draw rights into votes.
 if exists(select 1 from public.mobile_store_product_policies where store=p_store and product_id=p_product_id)then raise exception 'FAN_ECONOMY_INVALID';end if;
 insert into public.mobile_vote_purchase_intents(app_user_id,celebrity_id,request_key,product_policy_id,vote_policy_id,store,product_id,vote_quantity,currency,policy_version)values(p_app_user_id,creator,p_request_key,product.id,policy.id,p_store,p_product_id,product.vote_quantity,product.currency,product.version)returning * into prior;return public.mobile_vote_intent_json(prior,false);end $$;
create function public.read_owned_mobile_vote_intent(p_app_user_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare prior public.mobile_vote_purchase_intents%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into prior from public.mobile_vote_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
 if found and exists(select 1 from public.mobile_vote_transactions where intent_id=prior.id and state in('granted','revoked'))then return public.mobile_vote_intent_json(prior,true);end if;
 if exists(select 1 from public.mobile_fan_economy_cancellations where app_user_id=p_app_user_id and request_key=p_request_key and operation='vote_intent')then return jsonb_build_object('status','cancelled','requestKey',p_request_key,'operation','vote_intent');end if;
 if prior.id is null then return jsonb_build_object('status','unknown');end if;return public.mobile_vote_intent_json(prior,true);end $$;

create function public.mobile_vote_transaction_json(p_tx public.mobile_vote_transactions)returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('store',p_tx.store,'environment',p_tx.environment,'transactionId',p_tx.external_transaction_id,'intentId',p_tx.intent_id,'entitlementKind','paid_vote','celebrityId',i.celebrity_id,'productId',p_tx.product_id,'voteQuantity',i.vote_quantity,'policyVersion',i.policy_version,'state',p_tx.state,'pendingReason',p_tx.pending_reason,'amountKrw',p_tx.amount_krw,'refundedKrw',p_tx.refunded_krw,'availableVotes',case when l.refund_review or p_tx.pending_reason is not null or p_tx.state<>'granted' then 0 else coalesce(l.quantity-l.spent-l.reversed,0)end,'heldVotes',case when l.refund_review or p_tx.pending_reason is not null or p_tx.state<>'granted'then coalesce(l.quantity-l.spent-l.reversed,0)else 0 end,'finishAllowed',p_tx.state='granted'and p_tx.pending_reason is null,'consumeAllowed',p_tx.store='google'and p_tx.state='granted'and p_tx.pending_reason is null,'verifiedAt',p_tx.verified_at)from(select 1)x left join public.mobile_vote_purchase_intents i on i.id=p_tx.intent_id left join public.mobile_vote_purchase_lots l on l.transaction_id=p_tx.id $$;
create function public.apply_mobile_vote_verified(p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz,p_expected_owner uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$declare intent public.mobile_vote_purchase_intents%rowtype;tx public.mobile_vote_transactions%rowtype;lot public.mobile_vote_purchase_lots%rowtype;owner uuid;target bigint;available bigint;reverse_units bigint;entry uuid;source uuid;reason text;begin
 if p_store not in('apple','google')or p_environment not in('sandbox','production')or p_store_state not in('pending','purchased','revoked')or p_refunded_krw is null or p_refunded_krw<0 or length(coalesce(p_external_transaction_id,''))not between 1 and 300 or length(coalesce(p_verification_fingerprint,''))not between 1 and 300 then raise exception 'FAN_ECONOMY_INVALID';end if;
 select * into tx from public.mobile_vote_transactions where store=p_store and environment=p_environment and external_transaction_id=p_external_transaction_id;
 select * into intent from public.mobile_vote_purchase_intents where id=coalesce(tx.intent_id,p_profile_id)and store=p_store;
 owner:=intent.app_user_id;
 if intent.id is null and exists(select 1 from public.mobile_store_purchase_intents where id=p_profile_id and store=p_store)then raise exception 'FAN_ECONOMY_ENTITLEMENT_MISMATCH';end if;
 if p_expected_owner is not null and (owner is null or owner<>p_expected_owner)then raise exception 'FAN_ECONOMY_ACCOUNT_MISMATCH';end if;
 -- Trusted callbacks share deletion's lock but must still record inactive-owner proof.
 if owner is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||owner,0));end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-vote-transaction:'||p_store||':'||p_environment||':'||p_external_transaction_id,0));
 select * into tx from public.mobile_vote_transactions where store=p_store and environment=p_environment and external_transaction_id=p_external_transaction_id for update;
 if found and (tx.product_id<>p_product_id or (p_profile_id is not null and tx.intent_id is not null and tx.intent_id<>p_profile_id)or(tx.amount_krw is not null and p_amount_krw is not null and tx.amount_krw<>p_amount_krw))then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
 if tx.id is null then insert into public.mobile_vote_transactions(store,environment,external_transaction_id,intent_id,product_id,amount_krw,refunded_krw,verification_fingerprint,store_event_at)values(p_store,p_environment,p_external_transaction_id,intent.id,p_product_id,p_amount_krw,p_refunded_krw,p_verification_fingerprint,p_store_event_at)returning * into tx;
 else update public.mobile_vote_transactions set refunded_krw=greatest(refunded_krw,p_refunded_krw),amount_krw=coalesce(amount_krw,p_amount_krw),verification_fingerprint=p_verification_fingerprint,store_event_at=greatest(store_event_at,p_store_event_at),verified_at=clock_timestamp()where id=tx.id returning * into tx;end if;
 reason:=case when p_environment<>'sandbox'then 'production_rejected'when intent.id is null then 'missing_intent'when not exists(select 1 from public.app_users where id=owner and status='active')then 'account_unavailable'when intent.product_id<>p_product_id then 'product_mismatch'when p_currency is distinct from 'KRW'then 'currency_mismatch'when tx.amount_krw is null then 'amount_unknown'when p_store_state='pending'then 'store_pending'else null end;
 if p_store_state='pending'and tx.state in('granted','revoked')and reason='store_pending'then return public.mobile_vote_transaction_json(tx);end if;
 if reason is not null then update public.mobile_vote_transactions set pending_reason=reason where id=tx.id returning * into tx;return public.mobile_vote_transaction_json(tx);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||owner||':'||intent.celebrity_id,0));
 select * into lot from public.mobile_vote_purchase_lots where transaction_id=tx.id for update;
 if not found then
  -- Refund/revocation may arrive before purchase; never mint those rights later.
  if tx.state='revoked' or p_store_state='revoked' or tx.refunded_krw>=tx.amount_krw then update public.mobile_vote_transactions set state='revoked',pending_reason=null where id=tx.id returning * into tx;return public.mobile_vote_transaction_json(tx);end if;
  perform public.mobile_fan_economy_post(owner,intent.celebrity_id,'paid_vote',intent.vote_quantity,'purchase',tx.id,intent.vote_policy_id);
  insert into public.mobile_vote_purchase_lots(transaction_id,app_user_id,celebrity_id,quantity)values(tx.id,owner,intent.celebrity_id,intent.vote_quantity)returning * into lot;
 end if;
 target:=case when p_store_state='revoked' then lot.quantity else least(lot.quantity,floor(lot.quantity::numeric*tx.refunded_krw/tx.amount_krw)::bigint)end;
 available:=lot.quantity-lot.spent-lot.reversed;reverse_units:=greatest(target-lot.reversed,0);
 if reverse_units>available or lot.refund_review then
  update public.mobile_vote_purchase_lots set refund_review=true where transaction_id=tx.id;
  update public.mobile_vote_transactions set state='granted',pending_reason='manual_review'where id=tx.id returning * into tx;
 else
  if reverse_units>0 then source:=extensions.gen_random_uuid();entry:=public.mobile_fan_economy_post(owner,intent.celebrity_id,'paid_vote',-reverse_units,'refund',source,intent.vote_policy_id);update public.mobile_vote_purchase_lots set reversed=reversed+reverse_units where transaction_id=tx.id;end if;
  update public.mobile_vote_transactions set state=case when target=lot.quantity then 'revoked'else 'granted'end,pending_reason=null where id=tx.id returning * into tx;
 end if;
 if tx.refunded_krw>0 then insert into public.mobile_vote_refund_steps(transaction_id,refunded_krw,reversed_units,held_units,ledger_id)values(tx.id,tx.refunded_krw,case when tx.pending_reason='manual_review'then 0 else reverse_units end,case when tx.pending_reason='manual_review'then available else 0 end,entry)on conflict do nothing;end if;
 return public.mobile_vote_transaction_json(tx);end $$;
create function public.apply_owned_mobile_vote_verified(p_app_user_id uuid,p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz)returns jsonb language plpgsql security definer set search_path='' as $$begin perform public.fan_web_lock_active_user(p_app_user_id);return public.apply_mobile_vote_verified(p_store,p_environment,p_external_transaction_id,p_profile_id,p_product_id,p_currency,p_amount_krw,p_refunded_krw,p_store_state,p_verification_fingerprint,p_store_event_at,p_app_user_id);end $$;
create function public.read_owned_mobile_vote_transactions(p_app_user_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$begin perform public.fan_web_lock_active_user(p_app_user_id);return jsonb_build_object('transactions',coalesce((select jsonb_agg(public.mobile_vote_transaction_json(t)order by t.verified_at desc,t.id)from public.mobile_vote_transactions t join public.mobile_vote_purchase_intents i on i.id=t.intent_id where i.app_user_id=p_app_user_id),'[]'));end $$;
-- Callback dispatcher preserves the original provider-verification and legacy accounting path.
create function public.mobile_store_apply_entitlement_verified(p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz)returns jsonb language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.mobile_vote_purchase_intents where id=p_profile_id and store=p_store)or exists(select 1 from public.mobile_vote_transactions where store=p_store and environment=p_environment and external_transaction_id=p_external_transaction_id)then return public.apply_mobile_vote_verified(p_store,p_environment,p_external_transaction_id,p_profile_id,p_product_id,p_currency,p_amount_krw,p_refunded_krw,p_store_state,p_verification_fingerprint,p_store_event_at,null);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||(select app_user_id from public.mobile_store_purchase_intents where id=coalesce((select intent_id from public.mobile_store_transactions where store=p_store and environment=p_environment and external_transaction_id=p_external_transaction_id),p_profile_id)),0));
 return public.mobile_store_apply_verified_transaction(p_store,p_environment,p_external_transaction_id,p_profile_id,p_product_id,p_currency,p_amount_krw,p_refunded_krw,p_store_state,p_verification_fingerprint,p_store_event_at);end $$;
-- No NEW legacy draw purchase after cutover. Original intent recovery is checked first.
alter function public.mobile_store_create_intent(uuid,text,text,text,text,uuid,text,uuid)rename to mobile_store_create_legacy_intent_before_cutover;
create function public.mobile_store_create_intent(p_app_user_id uuid,p_store text,p_product_id text,p_celebrity_slug text,p_policy_version text,p_expected_benefit_id uuid,p_expected_campaign_policy_version text,p_request_key uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare prior public.mobile_store_purchase_intents%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into prior from public.mobile_store_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then return public.mobile_store_create_legacy_intent_before_cutover(p_app_user_id,p_store,p_product_id,p_celebrity_slug,p_policy_version,p_expected_benefit_id,p_expected_campaign_policy_version,p_request_key);end if;raise exception 'MOBILE_STORE_PRODUCT_UNAVAILABLE';end $$;
create or replace function public.mobile_store_list_products(p_app_user_id uuid,p_store text,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$begin perform public.fan_web_lock_active_user(p_app_user_id);return jsonb_build_object('products','[]'::jsonb);end $$;
revoke all on function public.mobile_store_create_legacy_intent_before_cutover(uuid,text,text,text,text,uuid,text,uuid)from public,anon,authenticated,service_role;
revoke all on function public.mobile_store_create_intent(uuid,text,text,text,text,uuid,text,uuid)from public,anon,authenticated;grant execute on function public.mobile_store_create_intent(uuid,text,text,text,text,uuid,text,uuid)to service_role;
create or replace function public.vote_owned_mobile_fan_gift(p_app_user_id uuid,p_project_id uuid,p_request_key uuid,p_policy_version text,p_source text,p_quantity integer)returns jsonb language plpgsql security definer set search_path='' as $$declare input jsonb;prior public.mobile_fan_economy_requests%rowtype;project public.mobile_fan_gift_projects%rowtype;policy public.mobile_fan_economy_policies%rowtype;entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();lot record;needed bigint;take bigint;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_source not in('free','paid') or p_quantity is null or p_quantity not between 1 and 1000 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('projectId',p_project_id,'policyVersion',p_policy_version,'source',p_source,'quantity',p_quantity);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'vote' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'vote',input);
 select * into project from public.mobile_fan_gift_projects where id=p_project_id and status<>'draft';if not found then raise exception 'FAN_ECONOMY_PROJECT_UNAVAILABLE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_app_user_id||':'||project.celebrity_id,0));
 if p_source='paid' then perform 1 from public.mobile_vote_purchase_lots where app_user_id=p_app_user_id and celebrity_id=project.celebrity_id order by transaction_id for update;end if;
 select * into project from public.mobile_fan_gift_projects where id=p_project_id for update;
 if project.status<>'open' or at_time<project.opens_at or at_time>=project.closes_at then raise exception 'FAN_ECONOMY_PROJECT_CLOSED';end if;
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=project.celebrity_id and kind='vote' and retired_at is null and effective_at<=at_time;
 if not found or (p_source='paid' and public.mobile_vote_policy_ready(policy) is not true) or (p_source='free' and policy.rules->>'freeEnabled' is distinct from 'true') then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if policy.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 if p_source='paid' and coalesce((select sum(quantity-spent-reversed)from public.mobile_vote_purchase_lots where app_user_id=p_app_user_id and celebrity_id=project.celebrity_id and not refund_review and exists(select 1 from public.mobile_vote_transactions t where t.id=transaction_id and t.state='granted'and t.pending_reason is null)),0)<p_quantity then raise exception 'FAN_ECONOMY_INSUFFICIENT_BALANCE';end if;
 if p_quantity>least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000)or(policy.rules->>case when p_source='free'then 'freeDailyLimit'else 'paidDailyLimit'end is not null and p_quantity+coalesce((select sum(v.quantity)from public.mobile_fan_gift_votes v join public.mobile_fan_gift_projects p on p.id=v.project_id where v.app_user_id=p_app_user_id and p.celebrity_id=project.celebrity_id and v.source=p_source and v.created_at>=date_trunc('day',at_time at time zone'Asia/Seoul')at time zone'Asia/Seoul'),0)>(policy.rules->>case when p_source='free'then 'freeDailyLimit'else 'paidDailyLimit'end)::bigint)then raise exception 'FAN_ECONOMY_DAILY_LIMIT';end if;
 entry:=public.mobile_fan_economy_post(p_app_user_id,project.celebrity_id,case when p_source='free'then 'free_vote'else 'paid_vote'end,-p_quantity,'vote',p_request_key,policy.id);
 insert into public.mobile_fan_gift_votes values(p_request_key,p_app_user_id,project.id,p_source,p_quantity,entry,policy.id,at_time);
 if p_source='paid' then needed:=p_quantity;for lot in select * from public.mobile_vote_purchase_lots where app_user_id=p_app_user_id and celebrity_id=project.celebrity_id and not refund_review and exists(select 1 from public.mobile_vote_transactions t where t.id=transaction_id and t.state='granted'and t.pending_reason is null) and quantity>spent+reversed order by transaction_id loop take:=least(needed,lot.quantity-lot.spent-lot.reversed);update public.mobile_vote_purchase_lots set spent=spent+take where transaction_id=lot.transaction_id;insert into public.mobile_vote_lot_allocations values(p_request_key,lot.transaction_id,take);needed:=needed-take;exit when needed=0;end loop;end if;
 result:=jsonb_build_object('requestKey',p_request_key,'projectId',project.id,'celebrityId',project.celebrity_id,'source',p_source,'quantity',p_quantity,'ledgerId',entry,'policyVersion',policy.version,'createdAt',at_time,'replayed',false);
 insert into public.mobile_fan_economy_requests values(p_app_user_id,p_request_key,'vote',input,result,at_time);return result;end $$;
-- Keep source evidence independent of the retired ticket-earning policy.
create or replace function public.fan_ticket_activity_sources(p_owner uuid default null,p_creator uuid default null)
returns table(app_user_id uuid,celebrity_id uuid,action_key text,scope_key text,source_id uuid,occurred_at timestamptz)
language sql stable security definer set search_path='' as $$
with evidence as (
 select q.app_user_id,q.celebrity_id,'verification'::text action_key,'once'::text scope_key,q.id source_id,q.passed_at occurred_at from public.quiz_passes q
 union all select r.app_user_id,r.celebrity_id,'reaction','once',r.id,r.completed_at from public.fan_reactions r
 union all select m.app_user_id,m.celebrity_id,'comment','once',m.id,m.created_at from public.fan_lounge_messages m
 union all select m.app_user_id,n.celebrity_id,'comment','once',m.id,m.created_at from public.celebrity_notice_comments m join public.celebrity_notices n on n.id=m.notice_id
 union all select p.app_user_id,p.celebrity_id,'comment','once',p.id,p.created_at from public.fan_posts p where p.first_comment_eligible
 union all select s.app_user_id,s.celebrity_id,'checkin',split_part(s.source_key,':',3),s.id,s.issued_at from public.community_stamps s where s.kind='daily_checkin'
 union all select s.app_user_id,s.celebrity_id,case when s.membership_platform is null then 'certification' else 'membership_'||s.membership_platform::text end,case when s.membership_platform is null then s.mission_id::text else 'once'end,s.id,s.reviewed_at from public.certification_submissions s where s.status='approved'
 union all select l.owner_app_user_id,l.celebrity_id,'share','once',v.id,v.visited_at from public.community_stamp_share_visits v join public.community_stamp_share_links l on l.id=v.share_link_id where v.visitor_app_user_id<>l.owner_app_user_id
 union all select r.app_user_id,r.celebrity_id,'live_reservation',r.live_event_id::text,r.id,r.created_at from public.live_reservations r
 union all select a.app_user_id,a.celebrity_id,'live_attendance',a.live_event_id::text,a.id,a.created_at from public.live_attendances a
 union all select r.app_user_id,r.celebrity_id,'mission_completion',r.survey_id::text,r.id,r.submitted_at from public.live_survey_responses r where r.status='submitted' and not r.legacy_contract
 union all select c.app_user_id,c.celebrity_id,'first_clip','once',c.id,c.created_at from public.fan_clips c where c.first_stamp_eligible and c.deleted_at is null and c.hidden_at is null
 union all select j.app_user_id,l.celebrity_id,'journey_completion',j.live_event_id::text,j.id,j.completed_at from public.live_journey_completions j join public.live_events l on l.id=j.live_event_id
 union all select m.inviter_app_user_id,c.celebrity_id,'invitation_milestone',m.milestone_number::text,m.id,m.created_at from public.community_stamp_invitation_milestones m join public.community_stamp_invitation_reward_configs c on c.invitation_policy_version=m.invitation_policy_version
)
select distinct on(e.app_user_id,e.celebrity_id,e.action_key,e.scope_key)e.* from evidence e join public.app_users u on u.id=e.app_user_id and u.status='active' join public.celebrities c on c.id=e.celebrity_id and c.status='published'and c.archived_at is null where(p_owner is null or e.app_user_id=p_owner)and(p_creator is null or e.celebrity_id=p_creator)order by e.app_user_id,e.celebrity_id,e.action_key,e.scope_key,e.occurred_at,e.source_id $$;
create function public.award_mobile_fan_activity(p_owner uuid,p_creator uuid,p_action text,p_scope text)returns jsonb language plpgsql security definer set search_path='' as $$declare evidence record;policy public.mobile_fan_economy_policies%rowtype;receipt public.mobile_fan_economy_activity_receipts%rowtype;entry uuid;amount bigint;begin
 perform public.mobile_fan_lock_reward_source(p_owner,p_creator);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||p_creator,0));
 select * into receipt from public.mobile_fan_economy_activity_receipts where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope;
 if found then return jsonb_build_object('status','awarded','asset','fan_point','amount',(select l.amount from public.mobile_fan_economy_ledger l where l.id=receipt.point_ledger_id),'policyVersion',(select version from public.mobile_fan_economy_policies where id=receipt.policy_id),'sourceId',receipt.source_id,'ledgerId',receipt.point_ledger_id);end if;
 select * into evidence from public.fan_ticket_activity_sources(p_owner,p_creator)where action_key=p_action and scope_key=p_scope;
 if not found then return jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion',null,'sourceId',null,'ledgerId',null);end if;
 -- Historical credits are deduplication evidence even after consumption, never backfilled.
 if exists(select 1 from public.fan_ticket_activity_awards where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope)
 or exists(select 1 from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id=p_creator and public.fan_ticket_ledger.amount>0 and source_id=evidence.source_id and source_type in('passport_verification','manual_certification','live_reservation','live_attendance','mission_completion','journey_completion','invitation_milestone'))
 or(p_action='first_clip'and exists(select 1 from public.mobile_content_clip_reward_awards where app_user_id=p_owner and celebrity_id=p_creator))then return jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion',null,'sourceId',evidence.source_id,'ledgerId',null);end if;
 if not public.mobile_fan_source_uses_points(p_creator,evidence.occurred_at) then
  perform public.award_fan_ticket_activity(p_owner,p_creator,p_action,p_scope,false);
  return jsonb_build_object('status','legacy','asset','legacy_free_draw','sourceId',evidence.source_id);
 end if;
 -- The event interval, including a retired policy, fixes delayed delivery.
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=p_creator and kind='earning' and effective_at<=evidence.occurred_at and (retired_at is null or evidence.occurred_at<retired_at) order by effective_at desc limit 1;
 if not found or evidence.occurred_at<policy.effective_at or policy.rules->>p_action is null then return jsonb_build_object('status','unconfigured','asset','fan_point','amount',0,'policyVersion',null,'sourceId',evidence.source_id,'ledgerId',null);end if;
 amount:=(policy.rules->>p_action)::bigint;if amount=0 then return jsonb_build_object('status','disabled','asset','fan_point','amount',0,'policyVersion',policy.version,'sourceId',evidence.source_id,'ledgerId',null);end if;if amount<0 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 entry:=public.mobile_fan_economy_post(p_owner,p_creator,'fan_point',amount,'activity',evidence.source_id,policy.id);
 insert into public.mobile_fan_economy_activity_receipts(app_user_id,celebrity_id,action_key,scope_key,source_id,occurred_at,policy_id,point_ledger_id)values(p_owner,p_creator,p_action,p_scope,evidence.source_id,evidence.occurred_at,policy.id,entry);
 return jsonb_build_object('status','awarded','asset','fan_point','amount',amount,'policyVersion',policy.version,'sourceId',evidence.source_id,'ledgerId',entry);end $$;
create or replace function public.award_fan_ticket_activity(p_owner uuid,p_creator uuid,p_action text,p_scope text,p_backfill boolean)returns boolean language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if p_backfill then return false;end if;perform public.fan_web_lock_active_user(p_owner);if exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope)then return false;end if;result:=public.award_mobile_fan_activity(p_owner,p_creator,p_action,p_scope);return result->>'status'='awarded';end $$;
create or replace function public.reward_successful_quiz_pass()returns trigger language plpgsql security definer set search_path='' as $$declare attribution public.quiz_verification_attributions%rowtype;begin
 select * into attribution from public.quiz_verification_attributions where attempt_id=new.winning_attempt_id;
 if found then insert into public.quiz_pass_attributions(quiz_pass_id,attempt_id,source_type,source_id)values(new.id,new.winning_attempt_id,attribution.source_type,attribution.source_id);end if;
 perform public.award_mobile_fan_activity(new.app_user_id,new.celebrity_id,'verification','once');return new;end $$;
create or replace function public.reward_live_reservation_ticket()returns trigger language plpgsql security definer set search_path='' as $$begin perform public.award_mobile_fan_activity(new.app_user_id,new.celebrity_id,'live_reservation',new.live_event_id::text);return new;end $$;
create or replace function public.reward_live_attendance_ticket()returns trigger language plpgsql security definer set search_path='' as $$begin perform public.award_mobile_fan_activity(new.app_user_id,new.celebrity_id,'live_attendance',new.live_event_id::text);return new;end $$;
-- A point-only clip keeps the exact legacy unconfigured reward shape.
create or replace function public.award_mobile_content_first_clip(p_app_user_id uuid,p_celebrity_id uuid,p_clip_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare old_award public.mobile_content_clip_reward_awards%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into old_award from public.mobile_content_clip_reward_awards where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id;
 if found then return jsonb_build_object('status','awarded','ticketAmount',old_award.ticket_amount,'policyVersion',(select policy_version from public.mobile_content_clip_reward_policies where id=old_award.policy_id),'ledgerId',old_award.ledger_id);end if;
 if not exists(select 1 from public.fan_clips where id=p_clip_id and app_user_id=p_app_user_id and celebrity_id=p_celebrity_id)then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform public.award_mobile_fan_activity(p_app_user_id,p_celebrity_id,'first_clip','once');return jsonb_build_object('status','unconfigured');end $$;

alter table public.fan_ticket_activity_awards add column point_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),alter column ledger_id drop not null;
alter table public.fan_ticket_activity_awards add constraint fan_ticket_activity_one_asset check(num_nonnulls(ledger_id,point_ledger_id)=1);
alter table public.mobile_content_clip_reward_awards add column point_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),alter column ledger_id drop not null;
alter table public.mobile_content_clip_reward_awards add constraint mobile_content_clip_one_asset check(num_nonnulls(ledger_id,point_ledger_id)=1);
alter table public.community_stamp_invitation_milestones add column point_receipt_id uuid unique references public.mobile_fan_economy_activity_receipts(id);
alter table public.community_stamp_invitation_milestones drop constraint community_stamp_invitation_milestone_state;
alter table public.community_stamp_invitation_milestones add constraint community_stamp_invitation_milestone_state check((status='pending_configuration'and reward_config_version is null and ticket_entry_id is null and point_receipt_id is null and awarded_at is null)or(status='awarded'and reward_config_version is not null and num_nonnulls(ticket_entry_id,point_receipt_id)=1 and awarded_at is not null));
alter table public.live_journey_completions add column point_receipt_id uuid unique references public.mobile_fan_economy_activity_receipts(id);
alter table public.live_journey_completions add constraint live_journey_one_asset check(num_nonnulls(ticket_ledger_id,point_receipt_id)<=1);
create or replace function public.process_community_stamp_invitation_milestone(p_inviter_app_user_id uuid,p_milestone_number bigint)returns jsonb language plpgsql security definer set search_path='' as $$declare milestone public.community_stamp_invitation_milestones%rowtype;config public.community_stamp_invitation_reward_configs%rowtype;reward jsonb;receipt uuid;begin
 perform public.fan_web_lock_active_user(p_inviter_app_user_id);select * into milestone from public.community_stamp_invitation_milestones where inviter_app_user_id=p_inviter_app_user_id and milestone_number=p_milestone_number for update;
 if not found then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002';end if;if milestone.status='awarded'then return jsonb_build_object('state','qualified_reward_issued','replayed',true);end if;
 select * into config from public.community_stamp_invitation_reward_configs where invitation_policy_version=milestone.invitation_policy_version and effective_at<=clock_timestamp()order by effective_at desc,config_version desc limit 1;
 if not found then return jsonb_build_object('state','reward_pending_configuration','replayed',false);end if;
 reward:=public.award_mobile_fan_activity(p_inviter_app_user_id,config.celebrity_id,'invitation_milestone',milestone.milestone_number::text);
 if reward->>'status'<>'awarded'then return jsonb_build_object('state','reward_pending_configuration','replayed',false);end if;
 select id into receipt from public.mobile_fan_economy_activity_receipts where point_ledger_id=(reward->>'ledgerId')::uuid;
 update public.community_stamp_invitation_milestones set status='awarded',reward_config_version=config.config_version,point_receipt_id=receipt,awarded_at=clock_timestamp()where id=milestone.id;
 return jsonb_build_object('state','qualified_reward_issued','replayed',false);end $$;
-- Every point-only legacy read remains truthful and parses without a post-commit failure.
-- Legacy policy remains enabled for creators and sources that have not cut over.
create function public.read_owned_mobile_fan_reward(p_app_user_id uuid,p_source_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare receipt public.mobile_fan_economy_activity_receipts%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into receipt from public.mobile_fan_economy_activity_receipts where app_user_id=p_app_user_id and source_id=p_source_id;
 if not found then
 if exists(select 1 from public.fan_ticket_activity_awards where app_user_id=p_app_user_id and source_id=p_source_id and ledger_id is not null) then
 return(select jsonb_build_object('status','awarded','asset','legacy_free_draw','amount',l.amount,'policyVersion',l.policy_version::text,'sourceId',a.source_id,'ledgerId',l.id) from public.fan_ticket_activity_awards a join public.fan_ticket_ledger l on l.id=a.ledger_id where a.app_user_id=p_app_user_id and a.source_id=p_source_id limit 1);end if;
 if exists(select 1 from public.mobile_content_clip_reward_awards where app_user_id=p_app_user_id and clip_id=p_source_id and ledger_id is not null)then return(select jsonb_build_object('status','awarded','asset','legacy_free_draw','amount',a.ticket_amount,'policyVersion',p.policy_version,'sourceId',a.clip_id,'ledgerId',a.ledger_id)from public.mobile_content_clip_reward_awards a join public.mobile_content_clip_reward_policies p on p.id=a.policy_id where a.app_user_id=p_app_user_id and a.clip_id=p_source_id);end if;
 if exists(select 1 from public.fan_ticket_ledger where app_user_id=p_app_user_id and source_id=p_source_id and amount>0)then return(select jsonb_build_object('status','awarded','asset','legacy_free_draw','amount',l.amount,'policyVersion',l.policy_version::text,'sourceId',l.source_id,'ledgerId',l.id)from public.fan_ticket_ledger l where l.app_user_id=p_app_user_id and l.source_id=p_source_id and l.amount>0 order by owner_sequence limit 1);end if;
 return jsonb_build_object('status','unconfigured','asset','fan_point','amount',0,'policyVersion',null,'sourceId',p_source_id,'ledgerId',null);end if;
 return jsonb_build_object('status','awarded','asset','fan_point','amount',(select l.amount from public.mobile_fan_economy_ledger l where l.id=receipt.point_ledger_id),'policyVersion',(select version from public.mobile_fan_economy_policies where id=receipt.policy_id),'sourceId',receipt.source_id,'ledgerId',receipt.point_ledger_id);end $$;
-- Closed service surfaces: no generic grant/receipt mutation RPC is exposed.
do $$declare t text;f record;begin
 foreach t in array array['mobile_vote_product_policies','mobile_vote_purchase_intents','mobile_vote_transactions','mobile_vote_purchase_lots','mobile_vote_lot_allocations','mobile_vote_refund_steps']loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and(proname like '%mobile_vote%'or proname in('award_mobile_fan_activity','read_owned_mobile_fan_reward','mobile_store_apply_entitlement_verified'))loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);if f.proname like 'read_owned_%'or f.proname like 'create_owned_%'or f.proname='apply_owned_mobile_vote_verified'or f.proname='mobile_store_apply_entitlement_verified'then execute format('grant execute on function %s to service_role',f.signature);end if;end loop;
end $$;
create or replace function public.finalize_certification_review_internal(
  p_submission_id uuid,p_expected_revision bigint,p_decision public.certification_submission_status,p_rejection_reason text,
  p_review_source public.certification_review_source,p_actor uuid,p_allowlist uuid,
  p_telegram_user_id bigint,p_telegram_name text,p_telegram_username text,p_correlation uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare submission public.certification_submissions%rowtype; result jsonb; passport_id uuid; recipient text; celebrity_slug text;
  p_actor_owner uuid; activity_id uuid; stamp_id uuid; job_id uuid; operation_key text; issuance_id text;
begin
  if p_decision not in ('approved','rejected') or (p_decision='rejected')<>(p_rejection_reason is not null) then raise exception 'CERTIFICATION_DECISION_INVALID'; end if;
  if (p_review_source='admin_web' and (p_actor is null or p_allowlist is null or p_telegram_user_id is not null or p_telegram_name is not null or p_telegram_username is not null))
    or (p_review_source='telegram' and (p_decision<>'approved' or p_actor is not null or p_allowlist is not null or p_telegram_user_id is null or p_telegram_name is null)) then
    raise exception 'CERTIFICATION_REVIEW_ACTOR_INVALID';
  end if;
  select app_user_id into p_actor_owner from public.certification_submissions where id=p_submission_id;perform public.fan_web_lock_active_user(p_actor_owner);
  select * into strict submission from public.certification_submissions where id=p_submission_id for update;
  if submission.status<>'pending' or submission.review_revision<>p_expected_revision then raise exception 'CERTIFICATION_STALE_REVISION'; end if;
  if p_decision='approved' and exists(select 1 from public.certification_submissions where app_user_id=submission.app_user_id and mission_id=submission.mission_id and status='approved' and id<>submission.id) then raise exception 'CERTIFICATION_ALREADY_APPROVED'; end if;
  if p_decision='approved' and submission.membership_platform is not null then
    select id into passport_id from public.fan_passports where app_user_id=submission.app_user_id and celebrity_id=submission.celebrity_id and business_status='issued' for key share;
    if passport_id is null then raise exception 'CERTIFICATION_PASSPORT_REQUIRED'; end if;
    select address into recipient from public.user_wallets where app_user_id=submission.app_user_id and chain_id=91342 and provider='privy' and wallet_type='embedded' for key share;
    if recipient is null then raise exception 'CERTIFICATION_MEMBERSHIP_WALLET_NOT_READY'; end if;
    select slug into strict celebrity_slug from public.celebrities where id=submission.celebrity_id;
  end if;
  update public.certification_submissions set reward_ticket_amount=0,status=p_decision,rejection_reason=p_rejection_reason,
    review_source=p_review_source,reviewed_by_app_user_id=p_actor,reviewed_by_admin_allowlist_id=p_allowlist,
    reviewed_by_telegram_user_id=p_telegram_user_id,reviewed_by_telegram_name=p_telegram_name,
    reviewed_by_telegram_username=p_telegram_username,reviewed_at=now(),review_revision=review_revision+1,updated_at=now()
    where id=submission.id returning * into submission;
  if p_decision='approved' then
    if submission.membership_platform is not null then
      activity_id:=extensions.gen_random_uuid();stamp_id:=extensions.gen_random_uuid();job_id:=extensions.gen_random_uuid();
      operation_key:='byus:stamp:v1:'||stamp_id::text;issuance_id:='0x'||encode(extensions.digest(operation_key,'sha256'),'hex');
      insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id)
        values(activity_id,submission.app_user_id,submission.celebrity_id,'membership','certification_submission',submission.id);
    end if;
    if submission.reward_score_points>0 then insert into public.fan_score_ledger(app_user_id,celebrity_id,points,manual_submission_id) values(submission.app_user_id,submission.celebrity_id,submission.reward_score_points,submission.id); end if;
    perform public.award_mobile_fan_activity(submission.app_user_id,submission.celebrity_id,case when submission.membership_platform is null then 'certification'else 'membership_'||submission.membership_platform::text end,case when submission.membership_platform is null then submission.mission_id::text else 'once'end);
  end if;
  if p_decision='approved' and submission.membership_platform is not null then
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(job_id,'stamp',stamp_id,operation_key,1,jsonb_build_object('recipient',recipient,'celebritySlug',celebrity_slug,'issuanceId',issuance_id,'stampType','Membership'));
    insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id)
      values(stamp_id,submission.app_user_id,submission.celebrity_id,passport_id,activity_id,'membership',job_id);
  end if;
  result:=jsonb_build_object('id',submission.id,'status',submission.status,'revision',submission.review_revision,'replayed',false);
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
    values(p_actor,p_allowlist,'certification.submission.'||submission.status,'certification_submission',submission.id::text,p_correlation,
      jsonb_build_object('revision',submission.review_revision,'reason',p_rejection_reason,'reviewSource',p_review_source,
        'telegram',case when p_review_source='telegram' then jsonb_build_object('userId',p_telegram_user_id,'displayName',p_telegram_name,'username',p_telegram_username) else null end,
        'reward',jsonb_build_object('scorePoints',submission.reward_score_points,'ticketAmount',submission.reward_ticket_amount,
          'stampCount',case when submission.membership_platform is null then 0 else 1 end)));
  return result;
end $$;

create or replace function public.submit_owned_live_mission_before_fan_web(
  p_app_user_id uuid,p_mission_id uuid,p_idempotency_key uuid,p_answers jsonb,
  p_stamp_id uuid,p_stamp_operation_key text,p_stamp_issuance_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare mission public.live_surveys%rowtype; live_record public.live_events%rowtype;
  passport_record public.fan_passports%rowtype; attendance_record public.live_attendances%rowtype;
  response_record public.live_survey_responses%rowtype; existing public.live_survey_idempotency%rowtype;
  reward_setting public.live_reward_setting_revisions%rowtype; item jsonb; question_record public.live_survey_questions%rowtype;
  selected_id uuid; all_correct boolean:=true; request_hash text; activity_id uuid:=extensions.gen_random_uuid();
  job_id uuid:=extensions.gen_random_uuid(); expected_payload jsonb; job_record public.blockchain_jobs%rowtype;
  recipient text; celebrity_slug text; result jsonb; v_policy_version integer; v_outbox_id uuid;
begin
  select * into mission from public.live_surveys where id=p_mission_id and publication_status='published' and not legacy_contract;
  if not found then raise exception 'PHASE2_MISSION_NOT_FOUND' using errcode='P0002'; end if;
  if statement_timestamp() < mission.visible_from or statement_timestamp() >= mission.visible_until then
    raise exception 'PHASE2_MISSION_NOT_VISIBLE' using errcode='55000';
  end if;
  perform public.validate_phase2_mission_contract(mission.id);
  select * into strict live_record from public.live_events where id=mission.live_event_id;
  request_hash:=encode(extensions.digest((jsonb_build_object('missionId',p_mission_id,'answers',p_answers))::text,'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase2:mission:key:'||p_idempotency_key::text,0));
  select * into existing from public.live_survey_idempotency where idempotency_key=p_idempotency_key for update;
  if found then
    if existing.app_user_id<>p_app_user_id or existing.live_event_id<>mission.live_event_id or existing.request_hash<>request_hash then raise exception 'PHASE2_MISSION_IDEMPOTENCY_CONFLICT' using errcode='23514'; end if;
    return existing.result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase2:mission:target:'||p_app_user_id::text||':'||p_mission_id::text,0));
  select * into response_record from public.live_survey_responses where app_user_id=p_app_user_id and survey_id=p_mission_id for update;
  if found then raise exception 'PHASE2_MISSION_ALREADY_COMPLETED' using errcode='23505'; end if;
  select * into passport_record from public.fan_passports where app_user_id=p_app_user_id and celebrity_id=live_record.celebrity_id and business_status='issued' for key share;
  if not found then raise exception 'PHASE2_MISSION_PASSPORT_REQUIRED' using errcode='42501'; end if;
  select address into recipient from public.user_wallets where app_user_id=p_app_user_id and chain_id=91342 and provider='privy' and wallet_type='embedded' for key share;
  if recipient is null then raise exception 'PHASE2_MISSION_WALLET_NOT_READY' using errcode='55000'; end if;
  if mission.attendance_requirement='required' then
    select * into attendance_record from public.live_attendances where app_user_id=p_app_user_id and live_event_id=mission.live_event_id;
    if not found then raise exception 'PHASE2_MISSION_ATTENDANCE_REQUIRED' using errcode='42501'; end if;
  end if;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>(select count(*) from public.live_survey_questions where survey_id=p_mission_id) then raise exception 'PHASE2_MISSION_INVALID_ANSWERS' using errcode='22023'; end if;
  insert into public.live_survey_responses(app_user_id,live_event_id,celebrity_id,survey_id,attendance_id,passport_id,status,submitted_at,legacy_contract)
  values(p_app_user_id,mission.live_event_id,live_record.celebrity_id,mission.id,attendance_record.id,passport_record.id,'draft',null,false) returning * into response_record;
  for item in select value from jsonb_array_elements(p_answers) loop
    select * into question_record from public.live_survey_questions where id=(item->>'questionId')::uuid and survey_id=mission.id;
    if not found or jsonb_array_length(item->'selectedOptionIds')<>1 then raise exception 'PHASE2_MISSION_INVALID_ANSWERS' using errcode='22023'; end if;
    selected_id:=(item->'selectedOptionIds'->>0)::uuid;
    if not exists(select 1 from public.live_survey_options where id=selected_id and question_id=question_record.id) then raise exception 'PHASE2_MISSION_INVALID_ANSWERS' using errcode='22023'; end if;
    insert into public.live_survey_answers(response_id,question_id,selected_option_ids) values(response_record.id,question_record.id,array[selected_id]);
    if mission.mission_type='quiz' and selected_id<>question_record.correct_option_id then all_correct:=false; end if;
  end loop;
  update public.live_survey_responses set status='submitted',submitted_at=now(),correctness=case when mission.mission_type='quiz' then all_correct else null end where id=response_record.id returning * into response_record;
  select r.* into reward_setting from public.live_survey_reward_setting_bindings b join public.live_reward_setting_revisions r on r.id=b.reward_setting_revision_id where b.survey_id=mission.id and r.lifecycle_status='published';
  if not found then raise exception 'PHASE2_MISSION_REWARD_SETTINGS_REQUIRED' using errcode='23514'; end if;
  insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id) values(activity_id,p_app_user_id,live_record.celebrity_id,'survey','live_survey_response',response_record.id);
  if reward_setting.mission_score>0 then insert into public.fan_score_ledger(activity_id,app_user_id,celebrity_id,points) values(activity_id,p_app_user_id,live_record.celebrity_id,reward_setting.mission_score); end if;
  select activation.policy_version into strict v_policy_version from public.reward_policy_activation activation where activation.singleton=true;
  perform public.award_mobile_fan_activity(p_app_user_id,live_record.celebrity_id,'mission_completion',mission.id::text);
  select slug into strict celebrity_slug from public.celebrities where id=live_record.celebrity_id;
  if p_stamp_operation_key is distinct from 'byus:stamp:v1:'||p_stamp_id::text or p_stamp_issuance_id!~'^0x[0-9a-f]{64}$' then raise exception 'PHASE2_MISSION_ISSUANCE_CONFLICT' using errcode='22023'; end if;
  expected_payload:=jsonb_build_object('recipient',recipient,'celebritySlug',celebrity_slug,'issuanceId',p_stamp_issuance_id,'stampType','Survey');
  if public.fan_action_native_enabled(4,p_app_user_id,live_record.celebrity_id,mission.live_event_id) then
    v_outbox_id:=public.enqueue_fan_action_source('live_survey_responses',response_record.id::text,p_app_user_id,
      live_record.celebrity_id,mission.live_event_id,response_record.submitted_at,4,jsonb_build_array(jsonb_build_object(
        'entityType','stamp','entityId',p_stamp_id,'kind',1,'issuanceKey',p_stamp_issuance_id,
        'operationKey',p_stamp_operation_key,'legacyPayload',expected_payload)));
    insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id,fan_action_outbox_id)
      values(p_stamp_id,p_app_user_id,live_record.celebrity_id,passport_record.id,activity_id,'survey',null,v_outbox_id);
  else
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(job_id,'stamp',p_stamp_id,p_stamp_operation_key,1,expected_payload) on conflict(operation_key) do nothing;
    select * into job_record from public.blockchain_jobs where operation_key=p_stamp_operation_key for update;
    if not found or job_record.id<>job_id or job_record.entity_id<>p_stamp_id or job_record.payload<>expected_payload then raise exception 'PHASE2_MISSION_ISSUANCE_CONFLICT' using errcode='23514'; end if;
    insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id)
      values(p_stamp_id,p_app_user_id,live_record.celebrity_id,passport_record.id,activity_id,'survey',job_id);
  end if;
  perform public.freeze_live_reward_settings_on_issuance(reward_setting.id,now(),'live_survey_response',response_record.id);
  result:=jsonb_build_object('mission',jsonb_build_object('id',mission.id,'type',mission.mission_type,'completed',true,'correctness',case when mission.mission_type='quiz' then all_correct else null end,'scorePoints',reward_setting.mission_score,'ticketAmount',0,'stamp',jsonb_build_object('id',p_stamp_id,'businessStatus','completed','mintStatus','queued')));
  insert into public.live_survey_idempotency(idempotency_key,app_user_id,live_event_id,operation,request_hash,response_id,result) values(p_idempotency_key,p_app_user_id,mission.live_event_id,'submit',request_hash,response_record.id,result);
  return result;
end $$;

create or replace function public.evaluate_owned_live_journey(
  p_app_user_id uuid,
  p_live_slug text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  live_record public.live_events%rowtype;
  participation public.live_journey_participations%rowtype;
  requirement public.live_journey_requirement_revisions%rowtype;
  existing_evaluation public.live_journey_evaluations%rowtype;
  existing_completion public.live_journey_completions%rowtype;
  projection jsonb;
  requirements jsonb;
  completion_id uuid;
  completed_at timestamptz := pg_catalog.statement_timestamp();
  ticket_result jsonb;
  ticket_ledger_id uuid;
  result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_app_user_id is null or p_idempotency_key is null or p_live_slug is null
     or p_live_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'P3_JOURNEY_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('journey:idempotency:' || p_idempotency_key::text, 0)
  );
  select evaluation.* into existing_evaluation
  from public.live_journey_evaluations evaluation
  where evaluation.idempotency_key = p_idempotency_key;
  if found then
    if existing_evaluation.app_user_id <> p_app_user_id
       or not exists (
         select 1 from public.live_events keyed_live
         where keyed_live.id = existing_evaluation.live_event_id
           and keyed_live.slug = p_live_slug
       ) then
      raise exception 'P3_JOURNEY_IDEMPOTENCY_CONFLICT' using errcode = '23514';
    end if;
    return existing_evaluation.result;
  end if;

  perform 1 from public.app_users owner
  where owner.id = p_app_user_id and owner.status = 'active'
  for share;
  if not found then raise exception 'P3_JOURNEY_NOT_FOUND'; end if;
  select live.* into live_record
  from public.live_events live
  where live.slug = p_live_slug
    and live.publication_status = 'published'
    and live.archived_at is null;
  if not found then raise exception 'P3_JOURNEY_NOT_FOUND'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'journey:target:' || p_app_user_id::text || ':' || live_record.id::text, 0
    )
  );
  perform public.bind_owned_live_journey(
    p_app_user_id, live_record.id, 'evaluation', null, null
  );
  select bound.* into participation
  from public.live_journey_participations bound
  where bound.app_user_id = p_app_user_id
    and bound.live_event_id = live_record.id
  for update;
  if not found then raise exception 'P3_JOURNEY_NOT_FOUND'; end if;
  select revision.* into strict requirement
  from public.live_journey_requirement_revisions revision
  where revision.id = participation.requirement_revision_id;

  select completed.* into existing_completion
  from public.live_journey_completions completed
  where completed.app_user_id = p_app_user_id
    and completed.live_event_id = live_record.id;
  if found then
    result := public.project_owned_live_journey(
      p_app_user_id, live_record.id, participation.requirement_revision_id
    );
    insert into public.live_journey_evaluations (
      idempotency_key, app_user_id, live_event_id, requirement_revision_id, result
    ) values (
      p_idempotency_key, p_app_user_id, live_record.id,
      participation.requirement_revision_id, result
    );
    return result;
  end if;

  -- The canonical projector reads only authoritative operational facts.
  projection := public.project_owned_live_journey(
    p_app_user_id, live_record.id, participation.requirement_revision_id
  );
  requirements := projection->'requirements';

  if (projection->>'complete')::boolean then
    completion_id := extensions.gen_random_uuid();
    insert into public.live_journey_completions (
      id, app_user_id, live_event_id, requirement_revision_id,
      requirement_snapshot, bonus_ticket_amount, policy_version,
      reward_setting_revision, reward_setting_revision_id,
      ticket_ledger_id, completed_at
    ) values (
      completion_id, p_app_user_id, live_record.id, requirement.id,
      requirements, 0, requirement.policy_version,
      requirement.reward_setting_revision, requirement.reward_setting_revision_id,
      ticket_ledger_id, completed_at
    );
    if requirement.bonus_ticket_amount > 0 then
      perform public.freeze_live_reward_settings_on_issuance(
        requirement.reward_setting_revision_id, completed_at,
        'journey_completion', completion_id
      );
    end if;
    perform public.award_mobile_fan_activity(p_app_user_id,live_record.celebrity_id,'journey_completion',live_record.id::text);
    result := jsonb_build_object(
      'liveEventId', live_record.id,
      'requirementRevisionId', requirement.id,
      'eligible', true,
      'complete', true,
      'requirements', requirements,
      'bonusTicketAmount', 0,
      'completedAt', completed_at,
      'ticketLedgerId', ticket_ledger_id
    );
  else
    result := projection;
  end if;

  insert into public.live_journey_evaluations (
    idempotency_key, app_user_id, live_event_id, requirement_revision_id, result
  ) values (
    p_idempotency_key, p_app_user_id, live_record.id, requirement.id, result
  );
  return result;
end;
$$;



create function public.mobile_fan_economy_exchange_policy(p_owner uuid,p_creator uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare policy public.mobile_fan_economy_policies%rowtype;used bigint;begin
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=p_creator and kind='exchange'and retired_at is null and effective_at<=clock_timestamp();if not found then return jsonb_build_object('status','unconfigured');end if;
 select coalesce(sum((result->>'units')::bigint),0)into used from public.mobile_fan_economy_requests where app_user_id=p_owner and operation='exchange'and result->>'celebrityId'=p_creator::text and created_at>=date_trunc('day',clock_timestamp()at time zone'Asia/Seoul')at time zone'Asia/Seoul';
 return jsonb_build_object('status','configured','version',policy.version,'freeDrawPointCost',(policy.rules->>'free_draw')::bigint,'freeVotePointCost',(policy.rules->>'free_vote')::bigint,'maxUnits',least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000),'dailyRemaining',case when policy.rules->>'dailyLimit' is null then null else greatest((policy.rules->>'dailyLimit')::bigint-used,0)end);end $$;
create function public.mobile_fan_economy_vote_policy(p_creator uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare policy public.mobile_fan_economy_policies%rowtype;begin
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=p_creator and kind='vote'and retired_at is null and effective_at<=clock_timestamp();if not found then return jsonb_build_object('status','unconfigured');end if;
 return jsonb_build_object('status','configured','version',policy.version,'freeEnabled',coalesce((policy.rules->>'freeEnabled')::boolean,false),'paidEnabled',coalesce(public.mobile_vote_policy_ready(policy),false),'maxUnits',least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000),'influenceAlgorithm',policy.rules->>'influenceAlgorithm','maxPaidInfluenceBps',(policy.rules->>'maxPaidInfluenceBps')::integer);end $$;

create or replace function public.read_owned_mobile_fan_economy_wallet(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 return jsonb_build_object('celebrityId',creator,'fanPoints',public.mobile_fan_economy_balance(p_app_user_id,creator,'fan_point'),'freeDrawEntries',public.get_fan_ticket_balance(p_app_user_id,creator),'freeVotes',public.mobile_fan_economy_balance(p_app_user_id,creator,'free_vote'),'paidVotes',jsonb_build_object('available',coalesce((select sum(quantity-spent-reversed)from public.mobile_vote_purchase_lots where app_user_id=p_app_user_id and celebrity_id=creator and not refund_review and exists(select 1 from public.mobile_vote_transactions t where t.id=transaction_id and t.state='granted'and t.pending_reason is null)),0),'held',coalesce((select sum(quantity-spent-reversed)from public.mobile_vote_purchase_lots where app_user_id=p_app_user_id and celebrity_id=creator and(refund_review or exists(select 1 from public.mobile_vote_transactions t where t.id=transaction_id and(t.state<>'granted'or t.pending_reason is not null)))),0)),'legacyPaidDraw',coalesce((select resulting_balance from public.mobile_store_paid_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=creator order by owner_sequence desc limit 1),0),'policy',public.mobile_fan_economy_exchange_policy(p_app_user_id,creator));end $$;
create or replace function public.mobile_fan_gift_project_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',p.id,'celebrityId',p.celebrity_id,'title',p.title,'summary',p.summary,'imageUrl',p.image_url,'securedBudgetKrw',p.secured_budget_krw,'announcedAmountKrw',p.announced_amount_krw,'opensAt',p.opens_at,'closesAt',p.closes_at,'status',p.status,'freeVotes',coalesce((select sum(quantity)from public.mobile_fan_gift_votes where project_id=p.id and source='free'),0),'paidVotes',coalesce((select sum(quantity)from public.mobile_fan_gift_votes where project_id=p.id and source='paid'),0),'goal',p.goal,'influencePolicy',public.mobile_fan_economy_vote_policy(p.celebrity_id),'deliveryEvidenceUrl',p.delivery_evidence_url)from public.mobile_fan_gift_projects p where p.id=p_id and p.status<>'draft' $$;

create or replace function public.read_owned_mobile_fan_economy_missions(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;policy public.mobile_fan_economy_policies%rowtype;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='earning'and retired_at is null and effective_at<=clock_timestamp() and public.mobile_fan_source_uses_points(creator,clock_timestamp());if not found then return jsonb_build_object('celebrityId',creator,'policy',jsonb_build_object('status','unconfigured'),'missions','[]'::jsonb);end if;
 return jsonb_build_object('celebrityId',creator,'policy',jsonb_build_object('status','configured'),'missions',coalesce((select jsonb_agg(jsonb_build_object('key',r.key,'status',case when a.id is not null then'awarded'when e.source_id is not null then'processing'else'available'end,'pointAmount',r.value::bigint,'policyVersion',policy.version,'sourceId',e.source_id,'ledgerId',a.point_ledger_id)order by r.key)from jsonb_each_text(policy.rules)r left join lateral(select * from public.fan_ticket_activity_sources(p_app_user_id,creator)where action_key=r.key and occurred_at>=policy.effective_at and(r.key<>'checkin'or scope_key=public.community_stamp_kst_date()::text)order by occurred_at desc limit 1)e on true left join public.mobile_fan_economy_activity_receipts a on a.app_user_id=p_app_user_id and a.celebrity_id=creator and a.action_key=r.key and a.scope_key=e.scope_key where r.value::bigint>0 and not exists(select 1 from public.fan_ticket_activity_awards old where old.app_user_id=p_app_user_id and old.celebrity_id=creator and old.action_key=r.key and(old.scope_key='once'or(r.key='checkin'and old.scope_key=public.community_stamp_kst_date()::text)))and not exists(select 1 from public.fan_ticket_activity_sources(p_app_user_id,creator)past where past.action_key=r.key and past.scope_key='once'and past.occurred_at<policy.effective_at)),'[]'));end $$;

revoke all on function public.mobile_fan_economy_exchange_policy(uuid,uuid),public.mobile_fan_economy_vote_policy(uuid)from public,anon,authenticated,service_role;

alter function public.mobile_store_apply_owned_verified_transaction(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz)rename to mobile_store_apply_owned_legacy_before_cutover;
create function public.mobile_store_apply_owned_verified_transaction(p_app_user_id uuid,p_store text,p_environment text,p_external_transaction_id text,p_profile_id uuid,p_product_id text,p_currency text,p_amount_krw bigint,p_refunded_krw bigint,p_store_state text,p_verification_fingerprint text,p_store_event_at timestamptz default null)returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);if exists(select 1 from public.mobile_vote_purchase_intents where id=p_profile_id and store=p_store)then raise exception 'MOBILE_STORE_ENTITLEMENT_MISMATCH';end if;
 return public.mobile_store_apply_owned_legacy_before_cutover(p_app_user_id,p_store,p_environment,p_external_transaction_id,p_profile_id,p_product_id,p_currency,p_amount_krw,p_refunded_krw,p_store_state,p_verification_fingerprint,p_store_event_at);end $$;
revoke all on function public.mobile_store_apply_owned_legacy_before_cutover(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz)from public,anon,authenticated,service_role;
revoke all on function public.mobile_store_apply_owned_verified_transaction(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz)from public,anon,authenticated;grant execute on function public.mobile_store_apply_owned_verified_transaction(uuid,text,text,text,uuid,text,text,bigint,bigint,text,text,timestamptz)to service_role;
create or replace function public.get_owned_fan_ticket_activity(p_app_user_id uuid,p_slug text,p_before_sequence bigint default null,p_limit integer default 20,p_locale text default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.celebrities%rowtype; actions jsonb; history jsonb; next_before text; enabled boolean; today text:=public.community_stamp_kst_date()::text;
begin
 if p_app_user_id is null or not exists(select 1 from public.app_users u where u.id=p_app_user_id and u.status='active') then raise exception 'TICKET_NOT_FOUND'; end if;
 if p_limit is null or p_limit<1 or p_limit>50 or p_before_sequence<1 or p_locale is null or p_locale not in ('ko','en') then raise exception 'TICKET_INVALID_REQUEST'; end if;
 select * into c from public.celebrities where slug=p_slug and status='published' and archived_at is null;
 if not found then raise exception 'TICKET_NOT_FOUND'; end if;
 enabled:=coalesce((select p.enabled from public.fan_ticket_activity_policy p where p.celebrity_id=c.id),false);
 select coalesce(jsonb_agg(jsonb_build_object('key',k.key,'amount',1,
  'status',case when exists(select 1 from public.fan_ticket_activity_awards a where a.app_user_id=p_app_user_id and a.celebrity_id=c.id and a.action_key=k.key and a.scope_key=case when k.key='checkin' then today else 'once' end)
   or (k.key='verification' and exists(select 1 from public.fan_ticket_ledger l where l.app_user_id=p_app_user_id and l.celebrity_id=c.id and l.source_type='passport_verification' and l.entry_kind='credit')) then 'awarded'
  when exists(select 1 from public.fan_ticket_activity_sources(p_app_user_id,c.id) x where x.action_key=k.key and x.scope_key=case when k.key='checkin' then today else 'once' end) then 'processing'
  when k.key like 'membership_%' and exists(select 1 from public.certification_submissions s where s.app_user_id=p_app_user_id and s.celebrity_id=c.id and 'membership_'||s.membership_platform::text=k.key and s.status='pending') then 'pending'
  when k.key='share' and exists(select 1 from public.community_stamp_share_links l where l.owner_app_user_id=p_app_user_id and l.celebrity_id=c.id) then 'pending'
  else 'available' end,
  'href',case when k.key='verification' then '/c/'||c.slug||'/verify'
    when k.key='reaction' then '/'||c.slug
    when k.key='comment' then '/'||c.slug||'#cheers'
    when k.key='checkin' then '/'||c.slug||'#daily-checkin'
    when k.key like 'membership_%' then '/'||c.slug||'?tab=certifications#celebrity-content'
    else coalesce((select '/passports/'||p.id::text||'#community-stamps' from public.fan_passports p where p.app_user_id=p_app_user_id and p.celebrity_id=c.id),'/c/'||c.slug||'/verify') end
 ) order by k.pos),'[]'::jsonb) into actions
 from unnest(array['verification','reaction','checkin','comment','membership_instagram','membership_tiktok','membership_youtube','share']) with ordinality k(key,pos) where enabled;
 with page as (
  select l.*,a.action_key,a.occurred_at,a.backfill from public.fan_ticket_ledger l
  left join public.fan_ticket_activity_awards a on a.ledger_id=l.id
  where l.app_user_id=p_app_user_id and l.celebrity_id=c.id and (p_before_sequence is null or l.owner_sequence<p_before_sequence)
  order by l.owner_sequence desc limit p_limit+1
 ), visible as(select * from page order by owner_sequence desc limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'sequence',v.owner_sequence,'sourceType',coalesce(v.action_key,v.source_type),
  'label',coalesce((select bl.title from public.benefit_ticket_entries e join public.benefit_localizations bl on bl.benefit_id=e.benefit_id and bl.locale::text=p_locale where e.ticket_ledger_id=v.id or (v.source_type='benefit_entry_refund' and v.source_id=e.id) limit 1),v.action_key,v.source_type),
  'amount',v.amount,'createdAt',v.created_at,'occurredAt',coalesce(v.occurred_at,v.created_at),'backfill',coalesce(v.backfill,false),'balance',v.resulting_balance)
  order by v.owner_sequence desc),'[]'::jsonb),
  case when (select count(*) from page)>p_limit then min(v.owner_sequence)::text else null end
 into history,next_before from visible v;
 return jsonb_build_object('enabled',false,'creator',jsonb_build_object('slug',c.slug,'name',coalesce((select name from public.celebrity_localizations where celebrity_id=c.id and locale::text=p_locale),c.slug)),
 'balance',public.get_fan_ticket_balance(p_app_user_id,c.id),'today',today,'actions','[]'::jsonb,'history',history,'nextBefore',next_before);
end $$;

create function public.mobile_fan_economy_assert_uncancelled(p_owner uuid,p_key uuid,p_operation text,p_input jsonb)returns void language plpgsql security definer set search_path='' as $$declare cancelled public.mobile_fan_economy_cancellations%rowtype;prior public.mobile_fan_economy_requests%rowtype;intent public.mobile_vote_purchase_intents%rowtype;begin
 select * into cancelled from public.mobile_fan_economy_cancellations where app_user_id=p_owner and request_key=p_key;
 if found then if cancelled.operation<>p_operation or cancelled.input<>p_input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;raise exception 'FAN_ECONOMY_REQUEST_CANCELLED';end if;
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_owner and request_key=p_key;if found and(prior.operation<>p_operation or prior.input<>p_input)then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
 select * into intent from public.mobile_vote_purchase_intents where app_user_id=p_owner and request_key=p_key;if found and(p_operation<>'vote_intent'or p_input<>jsonb_build_object('celebritySlug',(select slug from public.celebrities where id=intent.celebrity_id),'store',intent.store,'productId',intent.product_id,'policyVersion',intent.policy_version))then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
end $$;
create function public.cancel_owned_mobile_fan_economy_request(p_app_user_id uuid,p_request_key uuid,p_operation text,p_input jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare prior public.mobile_fan_economy_requests%rowtype;cancelled public.mobile_fan_economy_cancellations%rowtype;intent public.mobile_vote_purchase_intents%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_operation not in('exchange','vote','vote_intent')or jsonb_typeof(p_input)<>'object'then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>p_operation or prior.input<>p_input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return jsonb_build_object('status','committed','result',prior.result);end if;
 select * into intent from public.mobile_vote_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then
 if p_operation<>'vote_intent'or p_input<>jsonb_build_object('celebritySlug',(select slug from public.celebrities where id=intent.celebrity_id),'store',intent.store,'productId',intent.product_id,'policyVersion',intent.policy_version)then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
 if exists(select 1 from public.mobile_vote_transactions where intent_id=intent.id and state in('granted','revoked'))then return jsonb_build_object('status','committed','result',public.mobile_vote_intent_json(intent,true));end if;
 if exists(select 1 from public.mobile_vote_transactions where intent_id=intent.id)then raise exception 'FAN_ECONOMY_REQUEST_PENDING';end if;
 end if;
 select * into cancelled from public.mobile_fan_economy_cancellations where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if cancelled.operation<>p_operation or cancelled.input<>p_input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
 else insert into public.mobile_fan_economy_cancellations values(p_app_user_id,p_request_key,p_operation,p_input,clock_timestamp());end if;
 return jsonb_build_object('status','cancelled','requestKey',p_request_key,'operation',p_operation);end $$;
create or replace function public.read_owned_mobile_fan_economy_request(p_app_user_id uuid,p_request_key uuid,p_operation text)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select r.result||jsonb_build_object('replayed',true)into result from public.mobile_fan_economy_requests r where r.app_user_id=p_app_user_id and r.request_key=p_request_key and r.operation=p_operation;if result is not null then return result;end if;
 if exists(select 1 from public.mobile_fan_economy_cancellations where app_user_id=p_app_user_id and request_key=p_request_key and operation=p_operation)then return jsonb_build_object('status','cancelled','requestKey',p_request_key,'operation',p_operation);end if;return jsonb_build_object('status','unknown');end $$;
revoke all on function public.mobile_fan_economy_assert_uncancelled(uuid,uuid,text,jsonb),public.cancel_owned_mobile_fan_economy_request(uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.cancel_owned_mobile_fan_economy_request(uuid,uuid,text,jsonb)to service_role;

-- These internal fields identify actual receipts; HTTP serializers remove them
-- before parsing legacy DTOs and expose fanReward only for the opt-in contract.
alter function public.submit_owned_live_mission(uuid,uuid,uuid,jsonb,uuid,text,text)rename to submit_owned_live_mission_before_reward_source;
create function public.submit_owned_live_mission(p_app_user_id uuid,p_mission_id uuid,p_idempotency_key uuid,p_answers jsonb,p_stamp_id uuid,p_stamp_operation_key text,p_stamp_issuance_id text)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;source uuid;begin
 result:=public.submit_owned_live_mission_before_reward_source(p_app_user_id,p_mission_id,p_idempotency_key,p_answers,p_stamp_id,p_stamp_operation_key,p_stamp_issuance_id);
 select response_id into source from public.live_survey_idempotency where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key and operation='submit';
 if source is null or not exists(select 1 from public.live_survey_responses where id=source and app_user_id=p_app_user_id and survey_id=p_mission_id)then raise exception 'PHASE2_MISSION_INTEGRITY_ERROR';end if;
 return result||jsonb_build_object('responseId',source);end $$;
revoke all on function public.submit_owned_live_mission_before_reward_source(uuid,uuid,uuid,jsonb,uuid,text,text)from public,anon,authenticated,service_role;
revoke all on function public.submit_owned_live_mission(uuid,uuid,uuid,jsonb,uuid,text,text)from public,anon,authenticated;grant execute on function public.submit_owned_live_mission(uuid,uuid,uuid,jsonb,uuid,text,text)to service_role;

create or replace function public.project_owned_live_journey(
  p_app_user_id uuid,
  p_live_event_id uuid,
  p_requirement_revision_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  requirement public.live_journey_requirement_revisions%rowtype;
  completion public.live_journey_completions%rowtype;
  passport_complete boolean;
  reservation_complete boolean;
  attendance_complete boolean;
  missions jsonb;
  missions_complete boolean;
  eligible boolean;
  requirements jsonb;
begin
  select revision.* into strict requirement
  from public.live_journey_requirement_revisions revision
  where revision.id = p_requirement_revision_id
    and revision.live_event_id = p_live_event_id;
  select completed.* into completion
  from public.live_journey_completions completed
  where completed.app_user_id = p_app_user_id
    and completed.live_event_id = p_live_event_id;
  if found then
    return jsonb_build_object(
      'completionId',completion.id,
      'liveEventId', completion.live_event_id,
      'requirementRevisionId', completion.requirement_revision_id,
      'eligible', true,
      'complete', true,
      'requirements', completion.requirement_snapshot,
      'bonusTicketAmount', completion.bonus_ticket_amount,
      'completedAt', completion.completed_at,
      'ticketLedgerId', completion.ticket_ledger_id
    );
  end if;

  select exists (
    select 1 from public.fan_passports passport
    join public.live_events live on live.celebrity_id = passport.celebrity_id
    where live.id = p_live_event_id
      and passport.app_user_id = p_app_user_id
      and passport.business_status = 'issued'
  ) into passport_complete;
  select exists (
    select 1 from public.live_reservations reservation
    where reservation.app_user_id = p_app_user_id
      and reservation.live_event_id = p_live_event_id
  ) into reservation_complete;
  select exists (
    select 1 from public.live_attendances attendance
    where attendance.app_user_id = p_app_user_id
      and attendance.live_event_id = p_live_event_id
  ) into attendance_complete;
  with mission_states as materialized (
    select selected.mission_id, selected.mission_version, selected.position,
      exists (
        select 1 from public.live_survey_responses response
        where response.app_user_id = p_app_user_id
          and response.live_event_id = p_live_event_id
          and response.survey_id = selected.mission_id
          and response.status = 'submitted'
      ) as is_complete
    from public.live_journey_mission_requirements selected
    where selected.requirement_revision_id = requirement.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'missionId', mission.mission_id,
    'version', mission.mission_version,
    'state', case when mission.is_complete then 'complete' else 'incomplete' end
  ) order by mission.position), '[]'::jsonb),
  coalesce(bool_and(mission.is_complete), true)
  into missions, missions_complete
  from mission_states mission;

  eligible := (not requirement.require_passport or passport_complete)
    and (not requirement.require_reservation or reservation_complete)
    and (not requirement.require_attendance or attendance_complete);
  requirements := jsonb_build_object(
    'passport', jsonb_build_object(
      'required', requirement.require_passport,
      'state', case when passport_complete then 'complete' else 'incomplete' end
    ),
    'reservation', jsonb_build_object(
      'required', requirement.require_reservation,
      'state', case when reservation_complete then 'complete' else 'incomplete' end
    ),
    'attendance', jsonb_build_object(
      'required', requirement.require_attendance,
      'state', case when attendance_complete then 'complete' else 'incomplete' end
    ),
    'missions', missions
  );
  return jsonb_build_object(
    'completionId',null,
    'liveEventId', p_live_event_id,
    'requirementRevisionId', requirement.id,
    'eligible', eligible,
    'complete', eligible and missions_complete,
    'requirements', requirements,
    'bonusTicketAmount', 0,
    'completedAt', null,
    'ticketLedgerId', null
  );
end;
$$;

alter function public.evaluate_owned_live_journey(uuid,text,uuid)rename to evaluate_owned_live_journey_before_reward_source;
create function public.evaluate_owned_live_journey(p_app_user_id uuid,p_live_slug text,p_idempotency_key uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;source uuid;begin
 result:=public.evaluate_owned_live_journey_before_reward_source(p_app_user_id,p_live_slug,p_idempotency_key);
 if result->>'completedAt' is not null then select c.id into source from public.live_journey_completions c join public.live_events l on l.id=c.live_event_id where c.app_user_id=p_app_user_id and l.slug=p_live_slug and c.completed_at=(result->>'completedAt')::timestamptz;end if;
 if result->>'completedAt' is null then result:=jsonb_set(result,'{bonusTicketAmount}','0'::jsonb);end if;
 return result||jsonb_build_object('completionId',source);end $$;
revoke all on function public.evaluate_owned_live_journey_before_reward_source(uuid,text,uuid)from public,anon,authenticated,service_role;
revoke all on function public.evaluate_owned_live_journey(uuid,text,uuid)from public,anon,authenticated;grant execute on function public.evaluate_owned_live_journey(uuid,text,uuid)to service_role;
-- DB-installed cutover mode, independent of whether earning amounts are configured.
create function public.read_mobile_fan_economy_reward_mode()returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('mode','per_creator','legacyTicketEarning',true)$$;
revoke all on function public.read_mobile_fan_economy_reward_mode()from public,anon,authenticated;grant execute on function public.read_mobile_fan_economy_reward_mode()to service_role;
alter function public.get_public_certifications(text,public.content_locale)rename to get_public_certifications_before_point_cutover;
create function public.get_public_certifications(p_slug text,p_locale public.content_locale)returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(case when exists(select 1 from public.celebrities c where c.slug=p_slug and public.mobile_fan_source_uses_points(c.id,clock_timestamp())) then jsonb_set(item,'{reward,ticketAmount}','0'::jsonb) else item end order by ord),'[]'::jsonb)from jsonb_array_elements(public.get_public_certifications_before_point_cutover(p_slug,p_locale))with ordinality entries(item,ord)$$;
alter function public.get_public_certification(uuid,public.content_locale)rename to get_public_certification_before_point_cutover;
create function public.get_public_certification(p_id uuid,p_locale public.content_locale)returns jsonb language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.certification_missions m where m.id=p_id and public.mobile_fan_source_uses_points(m.celebrity_id,clock_timestamp())) then jsonb_set(base,'{reward,ticketAmount}','0'::jsonb) else base end from public.get_public_certification_before_point_cutover(p_id,p_locale) base$$;
revoke all on function public.get_public_certifications_before_point_cutover(text,public.content_locale),public.get_public_certification_before_point_cutover(uuid,public.content_locale)from public,anon,authenticated,service_role;
revoke all on function public.get_public_certifications(text,public.content_locale),public.get_public_certification(uuid,public.content_locale)from public,anon,authenticated;
grant execute on function public.get_public_certifications(text,public.content_locale),public.get_public_certification(uuid,public.content_locale)to service_role;
alter function public.get_community_stamp_invitation_overview(uuid)rename to get_community_stamp_invitation_overview_before_point_sources;
create function public.get_community_stamp_invitation_overview(p_app_user_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 result:=public.get_community_stamp_invitation_overview_before_point_sources(p_app_user_id);
 return result||jsonb_build_object('rewardSources',coalesce((select jsonb_agg(jsonb_build_object('sourceId',id,'pointReceiptId',point_receipt_id)order by milestone_number desc)from(select id,point_receipt_id,milestone_number from public.community_stamp_invitation_milestones where inviter_app_user_id=p_app_user_id and status='awarded'order by milestone_number desc limit 100)owned),'[]'::jsonb));end $$;
revoke all on function public.get_community_stamp_invitation_overview_before_point_sources(uuid)from public,anon,authenticated,service_role;
revoke all on function public.get_community_stamp_invitation_overview(uuid)from public,anon,authenticated;grant execute on function public.get_community_stamp_invitation_overview(uuid)to service_role;
create or replace function public.read_owned_mobile_benefit_free_ticket_missions(p_app_user_id uuid,p_celebrity_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_celebrity uuid;v_policy public.fan_ticket_activity_policy%rowtype;v_reward_policy integer;v_today text:=public.community_stamp_kst_date()::text;missions jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null;
  if v_celebrity is null then raise exception'MOBILE_BENEFIT_CELEBRITY_UNAVAILABLE';end if;
  select * into v_policy from public.fan_ticket_activity_policy where celebrity_id=v_celebrity and enabled and not public.mobile_fan_source_uses_points(v_celebrity,clock_timestamp());
  select policy_version into v_reward_policy from public.reward_policy_activation where singleton;
  with definitions as(
    select * from(values
      ('daily_attendance','checkin',v_today,'community_stamp_daily_checkin',false,1),
      ('eligible_comment','comment','once','eligible_fan_comment',false,2),
      ('first_signup','verification','once','quiz_pass',true,3)
    )d(key,action_key,scope_key,evidence_type,requires_fan_verification,pos)
  ),projected as(
    select d.*,source.source_id,source.occurred_at,a.ledger_id,l.amount awarded_amount,l.policy_version awarded_rule_version,l.created_at awarded_at
    from definitions d
    left join lateral(select x.source_id,x.occurred_at from public.fan_ticket_activity_sources(p_app_user_id,v_celebrity)x where x.action_key=d.action_key and x.scope_key=d.scope_key limit 1)source on true
    left join public.fan_ticket_activity_awards a on a.app_user_id=p_app_user_id and a.celebrity_id=v_celebrity and a.action_key=d.action_key and a.scope_key=d.scope_key
    left join public.fan_ticket_ledger l on l.id=a.ledger_id
  )
  select jsonb_agg(jsonb_build_object('key',p.key,'status',case when v_policy.celebrity_id is null then'unconfigured'when p.ledger_id is not null then'awarded'when p.source_id is not null then'processing'else'available'end,'ticketAmount',case when v_policy.celebrity_id is null then null else coalesce(p.awarded_amount,1)end,'ruleVersion',case when v_policy.celebrity_id is null then null else coalesce(p.awarded_rule_version,v_reward_policy)end,'scopeKey',case when v_policy.celebrity_id is null then null else p.scope_key end,'eligibilitySource',p.evidence_type,'requiresFanVerification',p.requires_fan_verification,'defaultPassportCounts',false,'sourceId',p.source_id,'occurredAt',p.occurred_at,'ledgerId',p.ledger_id,'awardedAt',p.awarded_at)order by p.pos)into missions from projected p;
  return jsonb_build_object('celebrityId',v_celebrity,'policy',case when v_policy.celebrity_id is null then jsonb_build_object('status','unconfigured')else jsonb_build_object('status','configured','activatedAt',v_policy.activated_at,'ruleVersion',v_reward_policy)end,'missions',missions);
end $$;
-- Source-bound new Lucky requests reuse the existing draw/raffle engines.
create table public.mobile_fan_economy_lucky_requests(app_user_id uuid not null references public.app_users(id),request_key uuid not null,operation text not null check(operation in('lucky_draw','lucky_raffle')),input jsonb not null,created_at timestamptz not null default clock_timestamp(),terminal_code text check(terminal_code in('POLICY_CHANGED','INSUFFICIENT_TICKETS','DAILY_LIMIT_REACHED','SOLD_OUT','BENEFIT_CLOSED','ENTRY_REJECTED')),primary key(app_user_id,request_key));
alter table public.mobile_fan_economy_lucky_requests enable row level security;alter table public.mobile_fan_economy_lucky_requests force row level security;revoke all on public.mobile_fan_economy_lucky_requests from public,anon,authenticated,service_role;
create trigger mobile_fan_economy_lucky_requests_immutable before update or delete on public.mobile_fan_economy_lucky_requests for each row execute function public.reject_fan_ticket_ledger_mutation();
create function public.mobile_free_lucky_terminal_json(r public.mobile_fan_economy_lucky_requests)returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('error',jsonb_build_object('code',r.terminal_code),'terminal',jsonb_build_object('status','rejected','requestKey',r.request_key,'operation',r.operation,'input',r.input,'proof','immutable_lucky_request'));$$;
create function public.read_owned_mobile_free_lucky(p_app_user_id uuid,p_request_key uuid,p_operation text)returns jsonb language plpgsql security definer set search_path='' as $$declare prior public.mobile_fan_economy_lucky_requests%rowtype;result jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into prior from public.mobile_fan_economy_lucky_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if not found then return null;end if;if prior.operation<>p_operation then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;
 if prior.operation='lucky_draw'then result:=public.read_owned_mobile_benefit_draw(p_app_user_id,p_request_key);else result:=public.read_owned_mobile_benefit_entry(p_app_user_id,p_request_key);end if;
 if result is not null then return result;end if;if prior.terminal_code is not null then return public.mobile_free_lucky_terminal_json(prior);end if;raise exception 'MOBILE_BENEFITS_UNAVAILABLE';end $$;
revoke all on function public.mobile_free_lucky_terminal_json(public.mobile_fan_economy_lucky_requests),public.read_owned_mobile_free_lucky(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_free_lucky(uuid,uuid,text)to service_role;
alter function public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz)rename to draw_owned_mobile_benefit_before_free_source;
create function public.draw_owned_mobile_benefit(p_app_user_id uuid,p_benefit_id uuid,p_request_key uuid,p_policy_version text,p_now timestamptz default clock_timestamp())returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);if exists(select 1 from public.mobile_fan_economy_lucky_requests where app_user_id=p_app_user_id and request_key=p_request_key)then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;return public.draw_owned_mobile_benefit_before_free_source(p_app_user_id,p_benefit_id,p_request_key,p_policy_version,p_now);end $$;
alter function public.enter_owned_benefit(uuid,uuid,uuid,integer,timestamptz)rename to enter_owned_benefit_before_free_source;
create function public.enter_owned_benefit(p_app_user_id uuid,p_benefit_id uuid,p_idempotency_key uuid,p_ticket_amount integer,p_now timestamptz default now())returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);if exists(select 1 from public.mobile_fan_economy_lucky_requests where app_user_id=p_app_user_id and request_key=p_idempotency_key)then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;return public.enter_owned_benefit_before_free_source(p_app_user_id,p_benefit_id,p_idempotency_key,p_ticket_amount,p_now);end $$;
create function public.submit_owned_mobile_free_lucky(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_benefit_id uuid,p_policy_version text,p_ticket_amount integer default null)returns jsonb language plpgsql security definer set search_path='' as $$declare operation_name text:=case when p_ticket_amount is null then 'lucky_draw'else 'lucky_raffle'end;request_input jsonb;prior public.mobile_fan_economy_lucky_requests%rowtype;policy public.mobile_benefit_policies%rowtype;creator uuid;result jsonb;cost integer;terminal_code text;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_benefit_id is null or length(coalesce(p_policy_version,''))not between 1 and 80 or(p_ticket_amount is not null and p_ticket_amount not between 1 and 1000)then raise exception 'MOBILE_BENEFIT_INVALID';end if;
 request_input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'benefitId',p_benefit_id,'policyVersion',p_policy_version,'freeOnly',true)||case when p_ticket_amount is null then '{}'::jsonb else jsonb_build_object('ticketAmount',p_ticket_amount)end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_lucky_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>operation_name or prior.input<>request_input then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;
 return public.read_owned_mobile_free_lucky(p_app_user_id,p_request_key,operation_name);end if;
 if exists(select 1 from public.mobile_benefit_draw_requests where id=p_request_key)or exists(select 1 from public.benefit_ticket_entries where idempotency_key=p_request_key)or exists(select 1 from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key)or exists(select 1 from public.mobile_fan_economy_cancellations where app_user_id=p_app_user_id and request_key=p_request_key)then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;
 begin
 -- A subtransaction rolls back any engine mutation before persisting a terminal rejection.
 -- Use the exact legacy request lock before policy/wallet locks, including mixed clients.
 if p_ticket_amount is null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-benefit-request:'||p_request_key::text,0));else perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase4:benefit-entry:key:'||p_request_key::text,0));end if;
 select b.celebrity_id into creator from public.benefits b join public.celebrities c on c.id=b.celebrity_id where b.id=p_benefit_id and b.publication_status='published'and c.slug=p_celebrity_slug and c.status='published'and c.archived_at is null;if creator is null then raise exception 'MOBILE_BENEFIT_CLOSED';end if;
 select * into policy from public.mobile_benefit_policies where benefit_id=p_benefit_id and retired_at is null for update;
 if not found or not policy.enabled or policy.mode<>(case when p_ticket_amount is null then'instant_draw'else'period_raffle'end) then raise exception 'MOBILE_BENEFIT_CLOSED';end if;
 if policy.policy_version<>p_policy_version then raise exception 'MOBILE_BENEFIT_POLICY_CHANGED';end if;
 cost:=coalesce(p_ticket_amount,policy.ticket_cost);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase1:ticket:balance:'||p_app_user_id::text||':'||creator::text,0));
 if public.get_fan_ticket_balance(p_app_user_id,creator)<cost then raise exception 'MOBILE_BENEFIT_INSUFFICIENT_TICKETS';end if;
 if p_ticket_amount is null then result:=public.draw_owned_mobile_benefit_before_free_source(p_app_user_id,p_benefit_id,p_request_key,p_policy_version,clock_timestamp());if result->>'paidTicketsUsed'is distinct from '0'then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;
 else result:=public.enter_owned_benefit_before_free_source(p_app_user_id,p_benefit_id,p_request_key,p_ticket_amount,clock_timestamp());end if;
 insert into public.mobile_fan_economy_lucky_requests(app_user_id,request_key,operation,input)values(p_app_user_id,p_request_key,operation_name,request_input);return result;
 exception when others then
 terminal_code:=case sqlerrm when 'MOBILE_BENEFIT_POLICY_CHANGED'then'POLICY_CHANGED'when 'MOBILE_BENEFIT_INSUFFICIENT_TICKETS'then'INSUFFICIENT_TICKETS'when 'MOBILE_BENEFIT_DAILY_LIMIT'then'DAILY_LIMIT_REACHED'when 'MOBILE_BENEFIT_SOLD_OUT'then'SOLD_OUT'when 'MOBILE_BENEFIT_CLOSED'then'BENEFIT_CLOSED'else case when sqlerrm like'PHASE4_BENEFIT_ENTRY%'and sqlerrm not like'%CONFLICT%'then'ENTRY_REJECTED'end end;
 if terminal_code is null then raise;end if;
 insert into public.mobile_fan_economy_lucky_requests(app_user_id,request_key,operation,input,terminal_code)values(p_app_user_id,p_request_key,operation_name,request_input,terminal_code)returning * into prior;
 return public.mobile_free_lucky_terminal_json(prior);
 end;end $$;
revoke all on function public.draw_owned_mobile_benefit_before_free_source(uuid,uuid,uuid,text,timestamptz),public.enter_owned_benefit_before_free_source(uuid,uuid,uuid,integer,timestamptz)from public,anon,authenticated,service_role;
revoke all on function public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz),public.enter_owned_benefit(uuid,uuid,uuid,integer,timestamptz),public.submit_owned_mobile_free_lucky(uuid,uuid,text,uuid,text,integer)from public,anon,authenticated;
grant execute on function public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz),public.enter_owned_benefit(uuid,uuid,uuid,integer,timestamptz),public.submit_owned_mobile_free_lucky(uuid,uuid,text,uuid,text,integer)to service_role;




-- Frozen submission rules are not an advertised ticket promise after cutover.
alter function public.get_owned_certification_submission(uuid,uuid,public.content_locale)rename to get_owned_certification_submission_before_point_projection;
create function public.get_owned_certification_submission(p_app_user_id uuid,p_submission_id uuid,p_locale public.content_locale)returns jsonb language sql stable security definer set search_path='' as $$
 select case when base is null then null when not exists(select 1 from public.certification_submissions x where x.id=p_submission_id and public.mobile_fan_source_uses_points(x.celebrity_id,clock_timestamp())) then base else jsonb_set(base,'{reward,ticketAmount}',to_jsonb(case when base->>'status'='approved'then coalesce((select sum(l.amount)from public.fan_ticket_ledger l where l.app_user_id=p_app_user_id and l.source_id=p_submission_id and l.entry_kind='credit'),0)else 0 end))end from public.get_owned_certification_submission_before_point_projection(p_app_user_id,p_submission_id,p_locale)base;
$$;
revoke all on function public.get_owned_certification_submission_before_point_projection(uuid,uuid,public.content_locale)from public,anon,authenticated,service_role;
revoke all on function public.get_owned_certification_submission(uuid,uuid,public.content_locale)from public,anon,authenticated;
grant execute on function public.get_owned_certification_submission(uuid,uuid,public.content_locale)to service_role;

-- Each producer executes exactly one original transaction body. Nested blocks retain
-- its declarations, exceptions, source writes, XP, stamps and validation unchanged.
do $merge$
declare f record; current_body text; legacy_body text; definition text; source_lock text;
begin
 for f in select p.*,g.condition from mobile_fan_legacy_producers p join (values
('award_fan_ticket_activity',$gate$public.mobile_fan_source_uses_points(p_creator,(select occurred_at from public.fan_ticket_activity_sources(p_owner,p_creator) where action_key=p_action and scope_key=p_scope))$gate$),
('reward_successful_quiz_pass',$gate$public.mobile_fan_source_uses_points(new.celebrity_id,new.passed_at)$gate$),
('reward_live_reservation_ticket',$gate$public.mobile_fan_source_uses_points(new.celebrity_id,new.created_at)$gate$),
('reward_live_attendance_ticket',$gate$public.mobile_fan_source_uses_points(new.celebrity_id,new.created_at)$gate$),
('award_mobile_content_first_clip',$gate$public.mobile_fan_source_uses_points(p_celebrity_id,(select created_at from public.fan_clips where id=p_clip_id))$gate$),
('process_community_stamp_invitation_milestone',$gate$exists(select 1 from public.community_stamp_invitation_milestones m join public.community_stamp_invitation_reward_configs c on c.invitation_policy_version=m.invitation_policy_version where m.inviter_app_user_id=p_inviter_app_user_id and m.milestone_number=p_milestone_number and public.mobile_fan_source_uses_points(c.celebrity_id,m.created_at))$gate$),
('finalize_certification_review_internal',$gate$exists(select 1 from public.certification_submissions s where s.id=p_submission_id and public.mobile_fan_source_uses_points(s.celebrity_id,coalesce(s.reviewed_at,now())))$gate$),
('submit_owned_live_mission_before_fan_web',$gate$exists(select 1 from public.live_surveys s join public.live_events l on l.id=s.live_event_id where s.id=p_mission_id and public.mobile_fan_source_uses_points(l.celebrity_id,now()))$gate$),
('evaluate_owned_live_journey',$gate$exists(select 1 from public.live_events l where l.slug=p_live_slug and public.mobile_fan_source_uses_points(l.celebrity_id,pg_catalog.statement_timestamp()))$gate$),
('get_owned_fan_ticket_activity',$gate$exists(select 1 from public.celebrities c where c.slug=p_slug and public.mobile_fan_source_uses_points(c.id,clock_timestamp()))$gate$),
('read_owned_mobile_benefit_free_ticket_missions',$gate$exists(select 1 from public.celebrities c where c.slug=p_celebrity_slug and public.mobile_fan_source_uses_points(c.id,clock_timestamp()))$gate$)
 ) g(name,condition) on g.name=p.proname loop
  select prosrc,pg_get_functiondef(oid) into current_body,definition from pg_proc where oid=f.oid;
  current_body:=regexp_replace(current_body,';[[:space:]]*$','');
  legacy_body:=regexp_replace(f.prosrc,';[[:space:]]*$','');
  if f.proname='award_fan_ticket_activity' then
   legacy_body:='begin if exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope) then return false;end if; if not exists(select 1 from public.fan_ticket_activity_policy where celebrity_id=p_creator and enabled) then return false;end if; '||legacy_body||'; end';
  end if;
  source_lock:=case f.proname
   when 'award_fan_ticket_activity' then 'perform public.mobile_fan_lock_reward_source(p_owner,p_creator);'
   when 'reward_successful_quiz_pass' then 'perform public.mobile_fan_lock_reward_source(new.app_user_id,new.celebrity_id);'
   when 'reward_live_reservation_ticket' then 'perform public.mobile_fan_lock_reward_source(new.app_user_id,new.celebrity_id);'
   when 'reward_live_attendance_ticket' then 'perform public.mobile_fan_lock_reward_source(new.app_user_id,new.celebrity_id);'
   when 'award_mobile_content_first_clip' then 'perform public.mobile_fan_lock_reward_source(p_app_user_id,p_celebrity_id);'
   when 'process_community_stamp_invitation_milestone' then 'perform public.mobile_fan_lock_reward_source(p_inviter_app_user_id,(select c.celebrity_id from public.community_stamp_invitation_milestones m join public.community_stamp_invitation_reward_configs c on c.invitation_policy_version=m.invitation_policy_version where m.inviter_app_user_id=p_inviter_app_user_id and m.milestone_number=p_milestone_number and c.effective_at<=clock_timestamp() order by c.effective_at desc,c.config_version desc limit 1));'
   when 'finalize_certification_review_internal' then 'perform public.mobile_fan_lock_reward_source((select app_user_id from public.certification_submissions where id=p_submission_id),(select celebrity_id from public.certification_submissions where id=p_submission_id));'
   when 'submit_owned_live_mission_before_fan_web' then 'perform public.mobile_fan_lock_reward_source(p_app_user_id,(select l.celebrity_id from public.live_surveys s join public.live_events l on l.id=s.live_event_id where s.id=p_mission_id));'
   when 'evaluate_owned_live_journey' then 'perform public.mobile_fan_lock_reward_source(p_app_user_id,(select celebrity_id from public.live_events where slug=p_live_slug));'
   else '' end;
  execute replace(definition,current_body,'begin '||source_lock||' if '||f.condition||' then '||current_body||'; else '||legacy_body||'; end if; end');
 end loop;
end $merge$;


create function public.read_mobile_fan_economy_reward_mode(p_celebrity_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode',case when uses_points then 'fan_point' else 'legacy_ticket' end,'legacyTicketEarning',not uses_points)
 from (select public.mobile_fan_source_uses_points(c.id,clock_timestamp()) uses_points from public.celebrities c where c.slug=p_celebrity_slug and c.status='published' and c.archived_at is null) x
$$;
revoke all on function public.read_mobile_fan_economy_reward_mode(text) from public,anon,authenticated;
grant execute on function public.read_mobile_fan_economy_reward_mode(text) to service_role;
-- The later quiz revision replaced the earlier account/invitation entry fences.
-- Restore them before user-row locks without copying or altering quiz semantics.
do $quiz_locks$
declare f record; original text; fence text;
begin
 for f in select oid,proname,prosrc,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in('start_owned_quiz_attempt','save_owned_quiz_answer_v2','submit_owned_quiz_attempt') loop
  original:=regexp_replace(f.prosrc,';[[:space:]]*$','');
  fence:=case when f.proname='submit_owned_quiz_attempt' then 'perform public.lock_community_stamp_invitation_users(p_app_user_id);' else 'perform public.fan_web_lock_active_user(p_app_user_id);' end;
  execute replace(f.definition,f.prosrc,'begin '||fence||' '||original||'; end');
 end loop;
end $quiz_locks$;

commit;

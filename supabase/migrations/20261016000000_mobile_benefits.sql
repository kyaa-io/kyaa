-- Mobile gift read models and an opt-in, replay-safe instant draw path.
-- No policy or tester is seeded: every mobile gift remains disabled by default.

create table public.mobile_benefit_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  benefit_id uuid not null references public.benefits(id) on delete restrict,
  mode text not null check (mode in ('period_raffle','instant_draw')),
  policy_version text not null check (policy_version=btrim(policy_version) and length(policy_version) between 1 and 80),
  ticket_cost integer not null check (ticket_cost>0),
  daily_limit integer check (daily_limit is null or daily_limit>0),
  allow_paid_tickets boolean not null default false,
  enabled boolean not null default false,
  tester_only boolean not null default true,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  result_at timestamptz,
  recipient_deadline_mode text check (recipient_deadline_mode is null or recipient_deadline_mode in ('after_award','fixed')),
  recipient_deadline_duration_hours integer check (recipient_deadline_duration_hours is null or recipient_deadline_duration_hours>0),
  recipient_deadline_fixed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  check (opens_at<closes_at),
  check (result_at is null or result_at>=closes_at),
  check (mode='instant_draw' or daily_limit is null),
  check (
    (recipient_deadline_mode is null and recipient_deadline_duration_hours is null and recipient_deadline_fixed_at is null)
    or (mode='instant_draw' and recipient_deadline_mode='after_award' and recipient_deadline_duration_hours is not null and recipient_deadline_fixed_at is null)
    or (mode='instant_draw' and recipient_deadline_mode='fixed' and recipient_deadline_duration_hours is null and recipient_deadline_fixed_at>=closes_at)
  ),
  check (mode<>'period_raffle' or not allow_paid_tickets),
  unique(benefit_id,policy_version)
);
create unique index mobile_benefit_one_active_policy on public.mobile_benefit_policies(benefit_id) where retired_at is null;

alter table public.mobile_store_purchase_intents add column benefit_policy_id uuid references public.mobile_benefit_policies(id)on delete restrict;

create table public.mobile_benefit_instant_prizes (
  id uuid primary key default extensions.gen_random_uuid(),
  policy_id uuid not null references public.mobile_benefit_policies(id) on delete restrict,
  outcome text not null check (outcome in ('won','not_selected')),
  weight integer not null check (weight>0),
  inventory_limit integer check (inventory_limit is null or inventory_limit>0),
  inventory_awarded integer not null default 0 check (inventory_awarded>=0),
  fulfillment_method public.benefit_fulfillment_method,
  image_url text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((outcome='won' and inventory_limit is not null and fulfillment_method is not null) or (outcome='not_selected' and inventory_limit is null and fulfillment_method is null)),
  check (inventory_limit is null or inventory_awarded<=inventory_limit)
);
alter table public.mobile_benefit_instant_prizes add constraint mobile_benefit_instant_prizes_id_policy_unique unique(id,policy_id);

create or replace function public.mobile_store_list_products(p_app_user_id uuid,p_store text,p_celebrity_slug text)
returns jsonb language plpgsql security definer set search_path=''as $$declare v_celebrity uuid;campaign public.mobile_benefit_policies%rowtype;campaign_json jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled)then raise exception'MOBILE_STORE_TESTER_REQUIRED'using errcode='42501';end if;if p_store not in('apple','google')then raise exception'MOBILE_STORE_INVALID';end if;
 select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null;if v_celebrity is null then raise exception'MOBILE_STORE_FAVORITE_UNAVAILABLE';end if;
 select p.*into campaign from public.mobile_benefit_policies p join public.benefits b on b.id=p.benefit_id where b.celebrity_id=v_celebrity and b.publication_status='published'and p.mode='instant_draw'and p.allow_paid_tickets and p.enabled and p.retired_at is null and clock_timestamp()>=p.opens_at and clock_timestamp()<p.closes_at and exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won'and ip.fulfillment_method='digital'and ip.inventory_awarded<ip.inventory_limit)and not exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.fulfillment_method<>'digital')order by p.closes_at,p.id limit 1;
 if found then campaign_json:=jsonb_build_object('benefitId',campaign.benefit_id,'policyVersion',campaign.policy_version,'ticketCost',campaign.ticket_cost,'opensAt',campaign.opens_at,'closesAt',campaign.closes_at,'allowedTicketSources',jsonb_build_array('free','paid'),'totalWeight',(select sum(weight)from public.mobile_benefit_instant_prizes where policy_id=campaign.id),'outcomes',(select jsonb_agg(jsonb_build_object('outcome',ip.outcome,'weight',ip.weight,'fulfillmentMethod',ip.fulfillment_method,'remainingInventory',case when ip.outcome='won'then greatest(ip.inventory_limit-ip.inventory_awarded,0)else null end)order by ip.id)from public.mobile_benefit_instant_prizes ip where ip.policy_id=campaign.id));end if;
 return jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_object('productId',p.product_id,'currency',p.currency,'ticketQuantity',p.ticket_quantity,'supportRateBps',p.support_rate_bps,'policyVersion',p.policy_version,'paidCampaign',campaign_json)order by p.product_id)from public.mobile_store_product_policies p where campaign.id is not null and p.store=p_store and p.environment='sandbox'and p.effective_at<=clock_timestamp()and p.retired_at is null),'[]'::jsonb));
end$$;

drop function public.mobile_store_create_intent(uuid,text,text,text,text,uuid);
create function public.mobile_store_create_intent(p_app_user_id uuid,p_store text,p_product_id text,p_celebrity_slug text,p_policy_version text,p_expected_benefit_id uuid,p_expected_campaign_policy_version text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=''as $$declare v_policy public.mobile_store_product_policies%rowtype;v_campaign public.mobile_benefit_policies%rowtype;v_celebrity uuid;v_intent public.mobile_store_purchase_intents%rowtype;campaign_json jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if not exists(select 1 from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id and enabled)then raise exception'MOBILE_STORE_TESTER_REQUIRED'using errcode='42501';end if;
 select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null for key share;if v_celebrity is null then raise exception'MOBILE_STORE_FAVORITE_UNAVAILABLE';end if;
 select*into v_intent from public.mobile_store_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if v_intent.store<>p_store or v_intent.product_id<>p_product_id or v_intent.policy_version<>p_policy_version or v_intent.celebrity_id<>v_celebrity then raise exception'MOBILE_STORE_IDEMPOTENCY_CONFLICT'using errcode='23514';end if;select*into v_campaign from public.mobile_benefit_policies where id=v_intent.benefit_policy_id;if not found or v_campaign.benefit_id<>p_expected_benefit_id or v_campaign.policy_version<>p_expected_campaign_policy_version then raise exception'MOBILE_STORE_IDEMPOTENCY_CONFLICT'using errcode='23514';end if;return jsonb_build_object('id',v_intent.id,'store',v_intent.store,'environment',v_intent.environment,'productId',v_intent.product_id,'currency',v_intent.currency,'paidCampaign',jsonb_build_object('benefitId',v_campaign.benefit_id,'policyVersion',v_campaign.policy_version),'appAccountToken',case when v_intent.store='apple'then v_intent.id else null end,'obfuscatedProfileId',case when v_intent.store='google'then v_intent.id else null end,'createdAt',v_intent.created_at,'replayed',true);end if;
 select*into v_policy from public.mobile_store_product_policies where store=p_store and environment='sandbox'and product_id=p_product_id and effective_at<=clock_timestamp()and retired_at is null;if not found then raise exception'MOBILE_STORE_PRODUCT_UNAVAILABLE';end if;if v_policy.policy_version<>p_policy_version then raise exception'MOBILE_STORE_POLICY_CHANGED'using errcode='40001';end if;
 select p.*into v_campaign from public.mobile_benefit_policies p join public.benefits b on b.id=p.benefit_id where b.celebrity_id=v_celebrity and b.publication_status='published'and p.mode='instant_draw'and p.allow_paid_tickets and p.enabled and p.retired_at is null and clock_timestamp()>=p.opens_at and clock_timestamp()<p.closes_at and exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won'and ip.fulfillment_method='digital'and ip.inventory_awarded<ip.inventory_limit)and not exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.fulfillment_method<>'digital')order by p.closes_at,p.id limit 1;if not found then raise exception'MOBILE_STORE_PAID_CAMPAIGN_UNAVAILABLE';end if;if v_campaign.benefit_id<>p_expected_benefit_id or v_campaign.policy_version<>p_expected_campaign_policy_version then raise exception'MOBILE_STORE_PAID_CAMPAIGN_CHANGED'using errcode='40001';end if;
 insert into public.mobile_store_purchase_intents(app_user_id,celebrity_id,product_policy_id,benefit_policy_id,store,environment,product_id,currency,policy_version,ticket_quantity,support_rate_bps,reward_policy_version,request_key)values(p_app_user_id,v_celebrity,v_policy.id,v_campaign.id,v_policy.store,v_policy.environment,v_policy.product_id,v_policy.currency,v_policy.policy_version,v_policy.ticket_quantity,v_policy.support_rate_bps,v_policy.reward_policy_version,p_request_key)returning*into v_intent;
 insert into public.mobile_store_intent_profiles(intent_id,app_user_id,store,profile_id)values(v_intent.id,p_app_user_id,p_store,v_intent.id);
 return jsonb_build_object('id',v_intent.id,'store',v_intent.store,'environment',v_intent.environment,'productId',v_intent.product_id,'currency',v_intent.currency,'paidCampaign',jsonb_build_object('benefitId',v_campaign.benefit_id,'policyVersion',v_campaign.policy_version),'appAccountToken',case when v_intent.store='apple'then v_intent.id else null end,'obfuscatedProfileId',case when v_intent.store='google'then v_intent.id else null end,'createdAt',v_intent.created_at,'replayed',false);
end$$;
revoke all on function public.mobile_store_create_intent(uuid,text,text,text,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mobile_store_create_intent(uuid,text,text,text,text,uuid,text,uuid) to service_role;

create table public.mobile_benefit_draw_requests (
  id uuid primary key,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  benefit_id uuid not null references public.benefits(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  policy_id uuid not null references public.mobile_benefit_policies(id) on delete restrict,
  policy_version text not null,
  prize_id uuid references public.mobile_benefit_instant_prizes(id) on delete restrict,
  outcome text not null check (outcome in ('won','not_selected')),
  entropy_hash text not null check (entropy_hash ~ '^[a-f0-9]{64}$'),
  free_tickets_used integer not null check (free_tickets_used>=0),
  paid_tickets_used integer not null check (paid_tickets_used>=0),
  free_ticket_ledger_id uuid unique references public.fan_ticket_ledger(id) on delete restrict,
  paid_ticket_ledger_id uuid unique references public.mobile_store_paid_ticket_ledger(id) on delete restrict,
  usage_date date not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (free_tickets_used+paid_tickets_used>0),
  unique(app_user_id,id),
  foreign key (prize_id,policy_id) references public.mobile_benefit_instant_prizes(id,policy_id) on delete restrict
);
create index mobile_benefit_draw_owner_history on public.mobile_benefit_draw_requests(app_user_id,created_at desc,id desc);

create table public.mobile_benefit_paid_allocations (
  draw_request_id uuid not null,
  store_transaction_id uuid not null references public.mobile_store_transactions(id) on delete restrict,
  ticket_amount integer not null check (ticket_amount>0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(draw_request_id,store_transaction_id),
  foreign key(draw_request_id) references public.mobile_benefit_draw_requests(id) on delete restrict deferrable initially deferred
);

create table public.mobile_benefit_awards (
  id uuid primary key default extensions.gen_random_uuid(),
  draw_request_id uuid not null unique references public.mobile_benefit_draw_requests(id) on delete restrict deferrable initially deferred,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  benefit_id uuid not null references public.benefits(id) on delete restrict,
  prize_id uuid not null references public.mobile_benefit_instant_prizes(id) on delete restrict,
  benefit_claim_id uuid unique references public.benefit_claims(id) on delete restrict,
  fulfillment_method public.benefit_fulfillment_method not null,
  fulfillment_status public.benefit_fulfillment_status not null,
  digital_delivery_value text,
  recipient_deadline_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check ((fulfillment_method='digital' and fulfillment_status='digital_delivered' and digital_delivery_value is not null and recipient_deadline_at is null) or (fulfillment_method<>'digital' and digital_delivery_value is null))
);
create index mobile_benefit_awards_owner on public.mobile_benefit_awards(app_user_id,created_at desc,id desc);

create table public.mobile_benefit_recipient_private (
  award_id uuid primary key references public.mobile_benefit_awards(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  consent_version text not null check (length(btrim(consent_version)) between 1 and 100),
  consented_at timestamptz not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text not null check (length(btrim(phone)) between 7 and 40),
  postal_code text,
  address1 text,
  address2 text,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(award_id,app_user_id)
);

create table public.mobile_benefit_admin_audits (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_admin_allowlist_id uuid not null references public.admin_allowlist(id) on delete restrict,
  action text not null check (action in ('policy_created','policy_enabled','policy_disabled','draw_reprocessed','consent_created','consent_activated','consent_deactivated')),
  policy_id uuid references public.mobile_benefit_policies(id) on delete restrict,
  draw_request_id uuid references public.mobile_benefit_draw_requests(id) on delete restrict,
  correlation_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.benefit_recipient_consent_versions
  add column documents jsonb,
  add constraint benefit_recipient_consent_documents_object check (documents is null or jsonb_typeof(documents)='object');

create function public.mobile_benefit_consent_documents_complete(p_documents jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare locale text;document jsonb;item jsonb;
begin
  if jsonb_typeof(p_documents)<>'object' then return false; end if;
  foreach locale in array array['ko','en'] loop
    document:=p_documents->locale;
    if jsonb_typeof(document)<>'object'
      or length(btrim(coalesce(document->>'title',''))) not between 1 and 200
      or length(btrim(coalesce(document->>'body',''))) not between 1 and 10000
      or not (document ? 'documentUrl')
      or (document->'documentUrl'<>'null'::jsonb and (jsonb_typeof(document->'documentUrl')<>'string' or length(btrim(document->>'documentUrl')) not between 1 and 2000))
      or jsonb_typeof(document->'items')<>'array'
      or jsonb_array_length(document->'items')=0 then return false;
    end if;
    for item in select value from jsonb_array_elements(document->'items') loop
      if jsonb_typeof(item)<>'object'
        or length(btrim(coalesce(item->>'id',''))) not between 1 and 100
        or length(btrim(coalesce(item->>'label',''))) not between 1 and 1000
        or jsonb_typeof(item->'required')<>'boolean' then return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- The legacy placeholder has no administrator-confirmed copy. Keep it for
-- historical recipient rows, but do not allow new consent against it.
update public.benefit_recipient_consent_versions
  set active=false
  where active and not public.mobile_benefit_consent_documents_complete(documents);

create function public.reject_mobile_benefit_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'MOBILE_BENEFIT_HISTORY_IMMUTABLE'; end $$;
create trigger mobile_benefit_draw_requests_immutable before update or delete on public.mobile_benefit_draw_requests for each row execute function public.reject_mobile_benefit_history_mutation();
create trigger mobile_benefit_draw_requests_reject_truncate before truncate on public.mobile_benefit_draw_requests for each statement execute function public.reject_mobile_benefit_history_mutation();
create trigger mobile_benefit_admin_audits_immutable before update or delete on public.mobile_benefit_admin_audits for each row execute function public.reject_mobile_benefit_history_mutation();
create trigger mobile_benefit_paid_allocations_immutable before update or delete on public.mobile_benefit_paid_allocations for each row execute function public.reject_mobile_benefit_history_mutation();

create function public.guard_mobile_benefit_policy_mutation() returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op='INSERT' then if new.enabled then raise exception 'MOBILE_BENEFIT_POLICY_ENABLE_AFTER_CONFIGURATION'; end if; return new; end if;
  if tg_op='UPDATE' and (to_jsonb(new)-'enabled')=(to_jsonb(old)-'enabled') then
    if new.enabled and not old.enabled then
      if new.mode='instant_draw' then
        if not exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id) then raise exception 'MOBILE_BENEFIT_POLICY_NO_OUTCOMES'; end if;
        if exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id and ip.outcome='won' and ip.inventory_awarded<>0) then raise exception 'MOBILE_BENEFIT_POLICY_ALREADY_USED'; end if;
        if new.allow_paid_tickets and exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id and ip.fulfillment_method in ('physical_shipping','on_site_pickup')) then raise exception 'MOBILE_BENEFIT_PHYSICAL_FREE_ONLY'; end if;
        if exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id and ip.fulfillment_method='digital') then
          if (select delivery_type from public.benefits where id=new.benefit_id)='unique_code' then
            if (select count(*) from public.benefit_unique_codes c where c.benefit_id=new.benefit_id and c.claimed_by_claim_id is null)<(select coalesce(sum(ip.inventory_limit),0) from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id and ip.outcome='won' and ip.fulfillment_method='digital') then raise exception 'MOBILE_BENEFIT_UNIQUE_CODE_INVENTORY_SHORT'; end if;
          elsif not exists(select 1 from public.benefit_delivery_vault v where v.benefit_id=new.benefit_id) then raise exception 'MOBILE_BENEFIT_DIGITAL_DELIVERY_UNAVAILABLE'; end if;
        end if;
        if (select coalesce(sum(ip.weight),0) from public.mobile_benefit_instant_prizes ip where ip.policy_id=new.id)<=0 then raise exception 'MOBILE_BENEFIT_POLICY_INVALID_WEIGHT'; end if;
      end if;
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and old.retired_at is null and new.retired_at is not null and not new.enabled and (to_jsonb(new)-'enabled'-'retired_at')=(to_jsonb(old)-'enabled'-'retired_at') then return new; end if;
  raise exception 'MOBILE_BENEFIT_POLICY_IMMUTABLE_NEW_VERSION_REQUIRED';
end $$;

create function public.read_admin_mobile_benefit_policies(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  return jsonb_build_object('policies',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'benefitId',p.benefit_id,'mode',p.mode,'policyVersion',p.policy_version,'ticketCost',p.ticket_cost,'dailyLimit',p.daily_limit,'allowPaidTickets',p.allow_paid_tickets,'enabled',p.enabled,'testerOnly',p.tester_only,'opensAt',p.opens_at,'closesAt',p.closes_at,'resultAt',p.result_at,'recipientDeadlinePolicy',case p.recipient_deadline_mode when 'after_award' then jsonb_build_object('mode','after_award','durationHours',p.recipient_deadline_duration_hours) when 'fixed' then jsonb_build_object('mode','fixed','deadlineAt',p.recipient_deadline_fixed_at) else null end,'retiredAt',p.retired_at,'outcomes',coalesce((select jsonb_agg(jsonb_build_object('id',ip.id,'outcome',ip.outcome,'weight',ip.weight,'inventoryLimit',ip.inventory_limit,'inventoryAwarded',ip.inventory_awarded,'fulfillmentMethod',ip.fulfillment_method,'imageUrl',ip.image_url) order by ip.id) from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id),'[]'::jsonb)) order by p.created_at desc,p.id desc) from public.mobile_benefit_policies p),'[]'::jsonb));
end $$;

create function public.create_admin_mobile_benefit_policy(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_benefit_id uuid,p_mode text,p_policy_version text,p_ticket_cost integer,p_daily_limit integer,p_allow_paid_tickets boolean,p_tester_only boolean,p_opens_at timestamptz,p_closes_at timestamptz,p_result_at timestamptz,p_recipient_deadline_policy jsonb,p_outcomes jsonb,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare p public.mobile_benefit_policies%rowtype;old public.mobile_benefit_policies%rowtype;x jsonb;deadline_mode text;duration_hours integer;fixed_at timestamptz; begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 or p_mode not in('period_raffle','instant_draw') or p_ticket_cost<=0 or (p_daily_limit is not null and p_daily_limit<=0) or p_opens_at>=p_closes_at or jsonb_typeof(p_outcomes)<>'array' then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
  if p_recipient_deadline_policy is not null then
    if p_mode<>'instant_draw' or jsonb_typeof(p_recipient_deadline_policy)<>'object' then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
    deadline_mode:=p_recipient_deadline_policy->>'mode';
    if deadline_mode='after_award' and (p_recipient_deadline_policy-(array['mode','durationHours']))='{}'::jsonb then duration_hours:=(p_recipient_deadline_policy->>'durationHours')::integer;
    elsif deadline_mode='fixed' and (p_recipient_deadline_policy-(array['mode','deadlineAt']))='{}'::jsonb then fixed_at:=(p_recipient_deadline_policy->>'deadlineAt')::timestamptz;
    else raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
  end if;
  select * into old from public.mobile_benefit_policies where benefit_id=p_benefit_id and retired_at is null for update;
  if found then if old.enabled then raise exception 'MOBILE_BENEFIT_DISABLE_CURRENT_FIRST'; end if; update public.mobile_benefit_policies set retired_at=pg_catalog.clock_timestamp() where id=old.id; end if;
  insert into public.mobile_benefit_policies(benefit_id,mode,policy_version,ticket_cost,daily_limit,allow_paid_tickets,tester_only,opens_at,closes_at,result_at,recipient_deadline_mode,recipient_deadline_duration_hours,recipient_deadline_fixed_at)
    values(p_benefit_id,p_mode,btrim(p_policy_version),p_ticket_cost,p_daily_limit,p_allow_paid_tickets,p_tester_only,p_opens_at,p_closes_at,p_result_at,deadline_mode,duration_hours,fixed_at) returning * into p;
  if p_mode='instant_draw' then
    if jsonb_array_length(p_outcomes)=0 then raise exception 'MOBILE_BENEFIT_POLICY_NO_OUTCOMES'; end if;
    for x in select value from jsonb_array_elements(p_outcomes) loop
      insert into public.mobile_benefit_instant_prizes(policy_id,outcome,weight,inventory_limit,fulfillment_method,image_url) values(p.id,x->>'outcome',(x->>'weight')::integer,(x->>'inventoryLimit')::integer,(x->>'fulfillmentMethod')::public.benefit_fulfillment_method,nullif(x->>'imageUrl',''));
    end loop;
  elsif jsonb_array_length(p_outcomes)<>0 then raise exception 'MOBILE_BENEFIT_PERIOD_OUTCOMES_NOT_ALLOWED'; end if;
  insert into public.mobile_benefit_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,policy_id,correlation_id,detail) values(p_actor_app_user_id,p_actor_admin_allowlist_id,'policy_created',p.id,p_correlation_id,jsonb_build_object('reason',btrim(p_reason),'policyVersion',p.policy_version));
  if p_recipient_deadline_policy is not null and not exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won' and ip.fulfillment_method<>'digital') then raise exception 'MOBILE_BENEFIT_DEADLINE_WITHOUT_RECIPIENT'; end if;
  return jsonb_build_object('policyId',p.id,'policyVersion',p.policy_version,'enabled',false);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end $$;

create function public.read_admin_mobile_benefit_consents(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  return jsonb_build_object('versions',coalesce((select jsonb_agg(jsonb_build_object('version',c.version,'active',c.active,'effectiveAt',c.effective_at,'documents',c.documents,'complete',public.mobile_benefit_consent_documents_complete(c.documents),'createdAt',c.created_at) order by c.created_at desc,c.version desc) from public.benefit_recipient_consent_versions c),'[]'::jsonb));
end $$;

create function public.create_admin_mobile_benefit_consent(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_version text,p_effective_at timestamptz,p_documents jsonb,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare version text:=btrim(p_version); begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if length(version) not between 1 and 100 or p_effective_at is null or not public.mobile_benefit_consent_documents_complete(p_documents) or length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'MOBILE_BENEFIT_CONSENT_INVALID'; end if;
  insert into public.benefit_recipient_consent_versions(version,active,effective_at,documents) values(version,false,p_effective_at,p_documents);
  insert into public.mobile_benefit_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,correlation_id,detail) values(p_actor_app_user_id,p_actor_admin_allowlist_id,'consent_created',p_correlation_id,jsonb_build_object('reason',btrim(p_reason),'consentVersion',version));
  return jsonb_build_object('version',version,'active',false,'effectiveAt',p_effective_at,'documents',p_documents);
exception when unique_violation or not_null_violation or check_violation then raise exception 'MOBILE_BENEFIT_CONSENT_INVALID'; end $$;

create function public.set_admin_mobile_benefit_consent_active(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_version text,p_active boolean,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare consent public.benefit_recipient_consent_versions%rowtype; begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_active is null or length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'MOBILE_BENEFIT_CONSENT_INVALID'; end if;
  select * into consent from public.benefit_recipient_consent_versions where version=btrim(p_version) for update;
  if not found then raise exception 'MOBILE_BENEFIT_CONSENT_NOT_FOUND'; end if;
  if p_active and not public.mobile_benefit_consent_documents_complete(consent.documents) then raise exception 'MOBILE_BENEFIT_CONSENT_INCOMPLETE'; end if;
  if p_active then update public.benefit_recipient_consent_versions set active=false where active and version<>consent.version; end if;
  update public.benefit_recipient_consent_versions set active=p_active where version=consent.version returning * into consent;
  insert into public.mobile_benefit_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,correlation_id,detail) values(p_actor_app_user_id,p_actor_admin_allowlist_id,case when p_active then 'consent_activated' else 'consent_deactivated' end,p_correlation_id,jsonb_build_object('reason',btrim(p_reason),'consentVersion',consent.version));
  return jsonb_build_object('version',consent.version,'active',consent.active,'effectiveAt',consent.effective_at,'documents',consent.documents);
end $$;

create function public.read_admin_mobile_benefit_operations(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_policy_id uuid default null,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);if p_limit not between 1 and 200 then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
  return jsonb_build_object('operations',coalesce((select jsonb_agg(jsonb_build_object('requestId',d.id,'policyId',d.policy_id,'policyVersion',d.policy_version,'benefitId',d.benefit_id,'appUserId',d.app_user_id,'outcome',d.outcome,'prizeId',d.prize_id,'freeTicketsUsed',d.free_tickets_used,'paidTicketsUsed',d.paid_tickets_used,'awardId',a.id,'fulfillmentStatus',a.fulfillment_status,'createdAt',d.created_at) order by d.created_at desc,d.id desc) from (select * from public.mobile_benefit_draw_requests where p_policy_id is null or policy_id=p_policy_id order by created_at desc,id desc limit p_limit)d left join public.mobile_benefit_awards a on a.draw_request_id=d.id),'[]'::jsonb));
end $$;
create trigger mobile_benefit_policy_immutable before insert or update or delete on public.mobile_benefit_policies for each row execute function public.guard_mobile_benefit_policy_mutation();
create function public.guard_mobile_benefit_prize_mutation() returns trigger language plpgsql set search_path='' as $$ begin
  if tg_op='UPDATE' and new.inventory_awarded=old.inventory_awarded+1 and (to_jsonb(new)-'inventory_awarded')=(to_jsonb(old)-'inventory_awarded') then return new; end if;
  raise exception 'MOBILE_BENEFIT_PRIZE_IMMUTABLE_NEW_VERSION_REQUIRED';
end $$;
create trigger mobile_benefit_prize_immutable before update or delete on public.mobile_benefit_instant_prizes for each row execute function public.guard_mobile_benefit_prize_mutation();

create function public.mobile_benefit_post_paid_debit(p_app_user_id uuid,p_celebrity_id uuid,p_request_id uuid,p_amount integer) returns jsonb
language plpgsql security definer set search_path='' as $$ declare v_balance bigint;v_sequence bigint;inserted public.mobile_store_paid_ticket_ledger%rowtype; begin
  if p_amount<=0 then raise exception 'MOBILE_BENEFIT_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-store-paid:'||p_app_user_id::text||':'||p_celebrity_id::text,0));
  select resulting_balance,owner_sequence+1 into v_balance,v_sequence from public.mobile_store_paid_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id order by owner_sequence desc limit 1;
  v_balance:=coalesce(v_balance,0)-p_amount;v_sequence:=coalesce(v_sequence,1);
  if v_balance<0 then raise exception 'MOBILE_BENEFIT_INSUFFICIENT_TICKETS'; end if;
  insert into public.mobile_store_paid_ticket_ledger(app_user_id,celebrity_id,transaction_id,entry_kind,amount,cumulative_refunded_krw,owner_sequence,resulting_balance)
    values(p_app_user_id,p_celebrity_id,p_request_id,'debit',-p_amount,null,v_sequence,v_balance) returning * into inserted;
  return jsonb_build_object('entryId',inserted.id,'balance',inserted.resulting_balance);
end $$;

create function public.mobile_benefit_require_tester(p_app_user_id uuid,p_tester_only boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_tester_only and not exists(select 1 from public.mobile_store_sandbox_testers t where t.app_user_id=p_app_user_id and t.enabled) then
    raise exception 'MOBILE_BENEFIT_TESTER_REQUIRED' using errcode='42501';
  end if;
end $$;

create function public.read_owned_mobile_benefit_catalog(p_app_user_id uuid,p_celebrity_slug text,p_locale public.content_locale default 'ko') returns jsonb
language plpgsql security definer set search_path='' as $$ declare v_celebrity uuid; begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  if v_celebrity is null then raise exception 'MOBILE_BENEFIT_CELEBRITY_UNAVAILABLE'; end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'benefitId',b.id,'slug',b.slug,'title',l.title,'summary',l.summary,'mode',p.mode,
    'imageUrl',case when p.mode='period_raffle' then(select item.teaser_image_url from public.live_benefit_campaign_items item join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id where item.benefit_id=b.id and campaign.status='published'order by campaign.entry_closes_at desc,campaign.id desc limit 1)else(select ip.image_url from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won'order by ip.created_at,ip.id limit 1)end,
    'eligibilityLabel',l.eligibility_label,'eligibility',jsonb_build_object('minimumScore',b.minimum_score,'minimumLevel',b.minimum_level,'requiredStampType',b.required_stamp_type,'requiredActivityType',b.required_activity_type,'perUserLimit',b.per_user_limit),
    'fulfillmentMethod',coalesce((select i.fulfillment_method::text from public.live_benefit_campaign_items i where i.benefit_id=b.id order by i.created_at desc limit 1),(select ip.fulfillment_method::text from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won' limit 1),'digital'),
    'ticketCost',p.ticket_cost,'dailyLimit',p.daily_limit,'policyVersion',p.policy_version,
    'opensAt',coalesce((select campaign.entry_opens_at from public.live_benefit_campaign_items item join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id where item.benefit_id=b.id and campaign.status='published'order by campaign.entry_closes_at desc,campaign.id desc limit 1),p.opens_at),
    'closesAt',coalesce((select campaign.entry_closes_at from public.live_benefit_campaign_items item join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id where item.benefit_id=b.id and campaign.status='published'order by campaign.entry_closes_at desc,campaign.id desc limit 1),p.closes_at),'resultAt',p.result_at,
    'remainingInventory',(select sum(greatest(ip.inventory_limit-ip.inventory_awarded,0))::integer from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won'),
    'allowedTicketSources',case when p.allow_paid_tickets then jsonb_build_array('free','paid') else jsonb_build_array('free') end,
    'recipientDeadlinePolicy',case p.recipient_deadline_mode when 'after_award' then jsonb_build_object('mode','after_award','durationHours',p.recipient_deadline_duration_hours) when 'fixed' then jsonb_build_object('mode','fixed','deadlineAt',p.recipient_deadline_fixed_at) else null end,
    'periodPolicy',case when p.mode='period_raffle'then(select jsonb_build_object('campaignId',item.campaign_id,'perFanTicketLimit',item.per_fan_ticket_limit,'winnerQuantity',item.winner_quantity)from public.live_benefit_campaign_items item join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id where item.benefit_id=b.id and campaign.status='published'order by campaign.entry_closes_at desc,campaign.id desc limit 1)else null end,
    'instantOdds',case when p.mode='instant_draw'then jsonb_build_object('totalWeight',(select sum(ip.weight)from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id),'outcomes',(select jsonb_agg(jsonb_build_object('id',ip.id,'outcome',ip.outcome,'weight',ip.weight,'imageUrl',ip.image_url,'fulfillmentMethod',ip.fulfillment_method,'remainingInventory',case when ip.outcome='won'then greatest(ip.inventory_limit-ip.inventory_awarded,0)else null end)order by ip.id)from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id))else null end
  ) order by p.closes_at,b.id) from public.mobile_benefit_policies p join public.benefits b on b.id=p.benefit_id
    join public.benefit_localizations l on l.benefit_id=b.id and l.locale=p_locale
    where b.celebrity_id=v_celebrity and b.publication_status='published' and p.enabled and p.retired_at is null
      and (not p.tester_only or exists(select 1 from public.mobile_store_sandbox_testers t where t.app_user_id=p_app_user_id and t.enabled))),'[]'::jsonb));
end $$;

create function public.read_owned_mobile_benefit_tickets(p_app_user_id uuid,p_celebrity_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare v_celebrity uuid;v_free bigint;v_paid bigint; begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  if v_celebrity is null then raise exception 'MOBILE_BENEFIT_CELEBRITY_UNAVAILABLE'; end if;
  v_free:=public.get_fan_ticket_balance(p_app_user_id,v_celebrity);
  select coalesce((select resulting_balance from public.mobile_store_paid_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=v_celebrity order by owner_sequence desc limit 1),0) into v_paid;
  return jsonb_build_object('celebrityId',v_celebrity,'balances',jsonb_build_object('free',v_free,'paid',v_paid,'total',v_free+v_paid));
end $$;

create function public.read_owned_mobile_benefit_ticket_history(p_app_user_id uuid,p_celebrity_slug text,p_limit integer default 30) returns jsonb
language plpgsql security definer set search_path='' as $$ declare v_celebrity uuid; begin
  perform public.fan_web_lock_active_user(p_app_user_id); if p_limit not between 1 and 100 then raise exception 'MOBILE_BENEFIT_INVALID'; end if;
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published' and archived_at is null;
  return jsonb_build_object('entries',coalesce((select jsonb_agg(x.row order by x.at desc,x.id desc) from (
    select l.created_at at,l.id,jsonb_build_object('id',l.id,'source','free','amount',l.amount,'status','settled','sourceType',l.source_type,'sourceId',l.source_id,'createdAt',l.created_at) row from public.fan_ticket_ledger l where l.app_user_id=p_app_user_id and l.celebrity_id=v_celebrity
    union all select l.created_at,l.id,jsonb_build_object('id',l.id,'source','paid','amount',l.amount,'status',case when t.state='pending' then 'pending' else 'settled' end,'sourceType',case when l.entry_kind='credit' then 'store_purchase' else 'store_refund_or_use' end,'sourceId',l.transaction_id,'createdAt',l.created_at) from public.mobile_store_paid_ticket_ledger l left join public.mobile_store_transactions t on t.id=l.transaction_id where l.app_user_id=p_app_user_id and l.celebrity_id=v_celebrity
    order by at desc,id desc limit p_limit) x),'[]'::jsonb));
end $$;

create function public.read_owned_mobile_benefit_free_ticket_missions(p_app_user_id uuid,p_celebrity_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_celebrity uuid;v_policy public.fan_ticket_activity_policy%rowtype;v_reward_policy integer;v_today text:=public.community_stamp_kst_date()::text;missions jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select id into v_celebrity from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null;
  if v_celebrity is null then raise exception'MOBILE_BENEFIT_CELEBRITY_UNAVAILABLE';end if;
  select * into v_policy from public.fan_ticket_activity_policy where celebrity_id=v_celebrity and enabled;
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

create function public.draw_owned_mobile_benefit(p_app_user_id uuid,p_benefit_id uuid,p_request_key uuid,p_policy_version text,p_now timestamptz default pg_catalog.clock_timestamp()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.mobile_benefit_policies%rowtype;b public.benefits%rowtype;existing public.mobile_benefit_draw_requests%rowtype;
  v_free bigint;v_paid bigint;v_use_free integer;v_use_paid integer;v_total_weight bigint;v_roll numeric:=0;v_running bigint:=0;prize public.mobile_benefit_instant_prizes%rowtype;
  v_free_ledger jsonb;v_paid_ledger jsonb;v_reward_policy integer;v_entropy bytea;v_index integer;v_remaining integer;purchase record;v_available bigint;v_take integer;v_delivery_value text;v_code public.benefit_unique_codes%rowtype;v_claim_id uuid;v_passport_id uuid;v_award_id uuid;v_usage_date date;v_recipient_deadline_at timestamptz;
begin
  if p_app_user_id is null or p_benefit_id is null or p_request_key is null or p_policy_version is null then raise exception 'MOBILE_BENEFIT_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-benefit-request:'||p_request_key::text,0));
  select * into existing from public.mobile_benefit_draw_requests where id=p_request_key;
  if found then
    if existing.app_user_id<>p_app_user_id or existing.benefit_id<>p_benefit_id or existing.policy_version<>p_policy_version then raise exception 'MOBILE_BENEFIT_REQUEST_CONFLICT' using errcode='23514'; end if;
    select id into v_award_id from public.mobile_benefit_awards where draw_request_id=existing.id;
    return jsonb_build_object('requestId',existing.id,'benefitId',existing.benefit_id,'policyVersion',existing.policy_version,'outcome',existing.outcome,'prizeId',existing.prize_id,'awardId',v_award_id,'freeTicketsUsed',existing.free_tickets_used,'paidTicketsUsed',existing.paid_tickets_used,'replayed',true);
  end if;
  select * into p from public.mobile_benefit_policies where benefit_id=p_benefit_id and retired_at is null for update;
  if not found or not p.enabled or p.mode<>'instant_draw' then raise exception 'MOBILE_BENEFIT_CLOSED'; end if;
  perform public.mobile_benefit_require_tester(p_app_user_id,p.tester_only);
  if p.policy_version<>p_policy_version then raise exception 'MOBILE_BENEFIT_POLICY_CHANGED'; end if;
  if p_now<p.opens_at or p_now>=p.closes_at then raise exception 'MOBILE_BENEFIT_CLOSED'; end if;
  v_usage_date:=(p_now at time zone 'Asia/Seoul')::date;
  if p.daily_limit is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-benefit-daily:'||p_app_user_id::text||':'||p.id::text||':'||v_usage_date::text,0));
    if (select count(*) from public.mobile_benefit_draw_requests d where d.app_user_id=p_app_user_id and d.policy_id=p.id and d.usage_date=v_usage_date)>=p.daily_limit then raise exception 'MOBILE_BENEFIT_DAILY_LIMIT'; end if;
  end if;
  select * into b from public.benefits where id=p_benefit_id and publication_status='published'; if not found then raise exception 'MOBILE_BENEFIT_CLOSED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase1:ticket:balance:'||p_app_user_id::text||':'||b.celebrity_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-store-paid:'||p_app_user_id::text||':'||b.celebrity_id::text,0));
  v_free:=public.get_fan_ticket_balance(p_app_user_id,b.celebrity_id);
  select coalesce((select resulting_balance from public.mobile_store_paid_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=b.celebrity_id order by owner_sequence desc limit 1),0) into v_paid;
  v_use_free:=least(v_free,p.ticket_cost);v_use_paid:=p.ticket_cost-v_use_free;
  if v_use_paid>0 and not p.allow_paid_tickets then raise exception 'MOBILE_BENEFIT_INSUFFICIENT_TICKETS'; end if;
  if v_use_paid>v_paid then raise exception 'MOBILE_BENEFIT_INSUFFICIENT_TICKETS'; end if;
  if v_use_paid>0 and exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.fulfillment_method in ('physical_shipping','on_site_pickup')) then raise exception 'MOBILE_BENEFIT_PHYSICAL_FREE_ONLY'; end if;
  -- Lock every outcome before choosing. A version closes as soon as any won
  -- outcome is exhausted; weights are never renormalized around sold prizes.
  perform 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id order by ip.id for update;
  if exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won' and ip.inventory_awarded>=ip.inventory_limit) then raise exception 'MOBILE_BENEFIT_SOLD_OUT'; end if;
  select coalesce(sum(weight),0) into v_total_weight from public.mobile_benefit_instant_prizes where policy_id=p.id;
  if v_total_weight=0 then raise exception 'MOBILE_BENEFIT_SOLD_OUT'; end if;
  v_entropy:=extensions.gen_random_bytes(32);
  for v_index in 0..7 loop v_roll:=v_roll*256+get_byte(v_entropy,v_index); end loop;
  v_roll:=mod(v_roll,v_total_weight)+1;
  for prize in select * from public.mobile_benefit_instant_prizes where policy_id=p.id order by id loop v_running:=v_running+prize.weight; exit when v_roll<=v_running; end loop;
  select policy_version into v_reward_policy from public.reward_policy_activation where singleton;
  if v_use_free>0 then v_free_ledger:=public.post_fan_ticket_entry(p_app_user_id,b.celebrity_id,'debit',-v_use_free,'mobile_instant_draw',p_request_key,p_request_key,v_reward_policy,null,null); end if;
  if v_use_paid>0 then
    v_remaining:=v_use_paid;
    for purchase in select t.id,t.ticket_quantity,t.ticket_reversed,coalesce((select sum(a.ticket_amount) from public.mobile_benefit_paid_allocations a where a.store_transaction_id=t.id),0) consumed
      from public.mobile_store_transactions t where t.app_user_id=p_app_user_id and t.celebrity_id=b.celebrity_id and t.state='granted' and t.ticket_quantity is not null order by t.created_at,t.id for update of t
    loop
      v_available:=purchase.ticket_quantity-purchase.ticket_reversed-purchase.consumed;
      if v_available>0 then v_take:=least(v_remaining,v_available)::integer; insert into public.mobile_benefit_paid_allocations(draw_request_id,store_transaction_id,ticket_amount) values(p_request_key,purchase.id,v_take);v_remaining:=v_remaining-v_take;exit when v_remaining=0;end if;
    end loop;
    if v_remaining<>0 then raise exception 'MOBILE_BENEFIT_PAID_ALLOCATION_UNAVAILABLE'; end if;
    v_paid_ledger:=public.mobile_benefit_post_paid_debit(p_app_user_id,b.celebrity_id,p_request_key,v_use_paid);
  end if;
  if prize.outcome='won' then update public.mobile_benefit_instant_prizes set inventory_awarded=inventory_awarded+1 where id=prize.id; end if;
  insert into public.mobile_benefit_draw_requests(id,app_user_id,benefit_id,celebrity_id,policy_id,policy_version,prize_id,outcome,entropy_hash,free_tickets_used,paid_tickets_used,free_ticket_ledger_id,paid_ticket_ledger_id,usage_date)
  values(p_request_key,p_app_user_id,p_benefit_id,b.celebrity_id,p.id,p.policy_version,case when prize.outcome='won' then prize.id end,prize.outcome,encode(extensions.digest(v_entropy,'sha256'),'hex'),v_use_free,v_use_paid,(v_free_ledger->>'entryId')::uuid,(v_paid_ledger->>'entryId')::uuid,v_usage_date) returning * into existing;
  if prize.outcome='won' then
    if prize.fulfillment_method='digital' then
      if b.delivery_type='unique_code' then
        select id into v_passport_id from public.fan_passports where app_user_id=p_app_user_id and celebrity_id=b.celebrity_id and business_status='issued' order by issued_at,id limit 1;
        if v_passport_id is null then raise exception 'MOBILE_BENEFIT_PASSPORT_REQUIRED'; end if;
        select * into v_code from public.benefit_unique_codes where benefit_id=p_benefit_id and claimed_by_claim_id is null order by created_at,id for update limit 1;
        if not found then raise exception 'MOBILE_BENEFIT_UNIQUE_CODE_SOLD_OUT'; end if;
        v_claim_id:=extensions.gen_random_uuid();
        insert into public.benefit_claims(id,benefit_id,app_user_id,celebrity_id,passport_id,idempotency_key,delivery_type,unique_code_id)
          values(v_claim_id,p_benefit_id,p_app_user_id,b.celebrity_id,v_passport_id,p_request_key,'unique_code',v_code.id);
        update public.benefit_unique_codes set claimed_by_claim_id=v_claim_id where id=v_code.id and claimed_by_claim_id is null;
        if not found then raise exception 'MOBILE_BENEFIT_UNIQUE_CODE_ALLOCATION_CONFLICT'; end if;v_delivery_value:=v_code.code_value;
      else select secret_value into v_delivery_value from public.benefit_delivery_vault where benefit_id=p_benefit_id; if v_delivery_value is null then raise exception 'MOBILE_BENEFIT_DIGITAL_DELIVERY_UNAVAILABLE'; end if; end if;
    end if;
    if prize.fulfillment_method<>'digital' then v_recipient_deadline_at:=case p.recipient_deadline_mode when 'after_award' then p_now+pg_catalog.make_interval(hours=>p.recipient_deadline_duration_hours) when 'fixed' then p.recipient_deadline_fixed_at else null end; end if;
    insert into public.mobile_benefit_awards(draw_request_id,app_user_id,benefit_id,prize_id,benefit_claim_id,fulfillment_method,fulfillment_status,digital_delivery_value,recipient_deadline_at)
      values(existing.id,p_app_user_id,p_benefit_id,prize.id,v_claim_id,prize.fulfillment_method,case when prize.fulfillment_method='digital' then 'digital_delivered'::public.benefit_fulfillment_status else 'information_required'::public.benefit_fulfillment_status end,v_delivery_value,v_recipient_deadline_at)returning id into v_award_id;
  end if;
  return jsonb_build_object('requestId',existing.id,'benefitId',existing.benefit_id,'policyVersion',existing.policy_version,'outcome',existing.outcome,'prizeId',existing.prize_id,'awardId',v_award_id,'freeTicketsUsed',existing.free_tickets_used,'paidTicketsUsed',existing.paid_tickets_used,'replayed',false);
end $$;

create function public.read_owned_mobile_benefit_good(p_app_user_id uuid,p_award_id uuid,p_locale public.content_locale default 'ko') returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb;consent_version text;consent_document jsonb;begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select version,documents->(p_locale::text) into consent_version,consent_document from public.benefit_recipient_consent_versions where active and effective_at<=pg_catalog.statement_timestamp()and public.mobile_benefit_consent_documents_complete(documents)order by effective_at desc,version desc limit 1;
  select jsonb_build_object('id',a.id,'benefitId',a.benefit_id,'title',l.title,'imageUrl',ip.image_url,'fulfillmentMethod',a.fulfillment_method,'fulfillmentStatus',a.fulfillment_status,'wonAt',a.created_at,'digitalDelivery',a.digital_delivery_value,'recipientDeadlineAt',a.recipient_deadline_at,
    'recipientPolicy',case when a.fulfillment_method='digital'or consent_version is null then null else jsonb_build_object('consentVersion',consent_version,'title',consent_document->>'title','body',consent_document->>'body','documentUrl',consent_document->'documentUrl','items',consent_document->'items','requiredFields',case when a.fulfillment_method='physical_shipping'then jsonb_build_array('name','phone','postalCode','address1','address2')else jsonb_build_array('name','phone')end)end)into result
    from public.mobile_benefit_awards a join public.mobile_benefit_instant_prizes ip on ip.id=a.prize_id join public.benefit_localizations l on l.benefit_id=a.benefit_id and l.locale=p_locale where a.id=p_award_id and a.app_user_id=p_app_user_id;
  if result is null then select jsonb_build_object('id',w.id,'benefitId',w.benefit_id,'title',l.title,'imageUrl',item.teaser_image_url,'fulfillmentMethod',f.method,'fulfillmentStatus',f.status,'wonAt',w.selected_at,'digitalDelivery',null,'recipientDeadlineAt',f.recipient_deadline_at,
    'recipientPolicy',case when f.method='digital'or consent_version is null then null else jsonb_build_object('consentVersion',consent_version,'title',consent_document->>'title','body',consent_document->>'body','documentUrl',consent_document->'documentUrl','items',consent_document->'items','requiredFields',case when f.method='physical_shipping'then jsonb_build_array('name','phone','postalCode','address1','address2')else jsonb_build_array('name','phone')end)end)into result
    from public.benefit_draw_winners w join public.benefit_fulfillments f on f.winner_id=w.id join public.live_benefit_campaign_items item on item.campaign_id=w.campaign_id and item.benefit_id=w.benefit_id join public.benefit_localizations l on l.benefit_id=w.benefit_id and l.locale=p_locale where w.id=p_award_id and w.app_user_id=p_app_user_id;end if;
  if result is null then raise exception'MOBILE_BENEFIT_AWARD_NOT_FOUND';end if;return result;
end $$;

create function public.save_owned_mobile_benefit_recipient(p_app_user_id uuid,p_award_id uuid,p_consent_version text,p_name text,p_phone text,p_postal_code text,p_address1 text,p_address2 text,p_now timestamptz default pg_catalog.clock_timestamp()) returns jsonb
language plpgsql security definer set search_path='' as $$ declare a public.mobile_benefit_awards%rowtype;r public.mobile_benefit_recipient_private%rowtype; begin
  perform public.fan_web_lock_active_user(p_app_user_id);select * into a from public.mobile_benefit_awards where id=p_award_id and app_user_id=p_app_user_id for update;
  if not found then raise exception 'MOBILE_BENEFIT_AWARD_NOT_FOUND'; end if;if a.fulfillment_method='digital' then raise exception 'MOBILE_BENEFIT_RECIPIENT_NOT_REQUIRED'; end if;
  if a.recipient_deadline_at is not null and p_now>=a.recipient_deadline_at then raise exception'MOBILE_BENEFIT_RECIPIENT_DEADLINE_EXPIRED';end if;
  if not exists(select 1 from public.benefit_recipient_consent_versions where version=btrim(p_consent_version)and active and effective_at<=p_now and public.mobile_benefit_consent_documents_complete(documents))then raise exception'MOBILE_BENEFIT_CONSENT_VERSION_INVALID';end if;
  insert into public.mobile_benefit_recipient_private(award_id,app_user_id,consent_version,consented_at,name,phone,postal_code,address1,address2)
    values(a.id,p_app_user_id,btrim(p_consent_version),p_now,btrim(p_name),btrim(p_phone),nullif(btrim(p_postal_code),''),nullif(btrim(p_address1),''),nullif(btrim(p_address2),''))
    on conflict(award_id) do update set consent_version=excluded.consent_version,consented_at=excluded.consented_at,name=excluded.name,phone=excluded.phone,postal_code=excluded.postal_code,address1=excluded.address1,address2=excluded.address2,updated_at=pg_catalog.clock_timestamp() returning * into r;
  update public.mobile_benefit_awards set fulfillment_status='ready',updated_at=pg_catalog.clock_timestamp() where id=a.id and fulfillment_status='information_required';
  return jsonb_build_object('awardId',r.award_id,'consentVersion',r.consent_version,'name',r.name,'phone',r.phone,'postalCode',r.postal_code,'address1',r.address1,'address2',r.address2,'updatedAt',r.updated_at);
end $$;

create function public.read_owned_mobile_benefit_recipient(p_app_user_id uuid,p_award_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare r public.mobile_benefit_recipient_private%rowtype; begin
  perform public.fan_web_lock_active_user(p_app_user_id);select * into r from public.mobile_benefit_recipient_private where award_id=p_award_id and app_user_id=p_app_user_id;
  if not found then return null; end if;return jsonb_build_object('awardId',r.award_id,'consentVersion',r.consent_version,'name',r.name,'phone',r.phone,'postalCode',r.postal_code,'address1',r.address1,'address2',r.address2,'updatedAt',r.updated_at);
end $$;

create function public.read_owned_mobile_benefit_draw(p_app_user_id uuid,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare d public.mobile_benefit_draw_requests%rowtype;award_id uuid;begin
  perform public.fan_web_lock_active_user(p_app_user_id); select * into d from public.mobile_benefit_draw_requests where id=p_request_key and app_user_id=p_app_user_id;
  if not found then return null;end if;select id into award_id from public.mobile_benefit_awards where draw_request_id=d.id;
  return jsonb_build_object('requestId',d.id,'benefitId',d.benefit_id,'policyVersion',d.policy_version,'outcome',d.outcome,'prizeId',d.prize_id,'awardId',award_id,'freeTicketsUsed',d.free_tickets_used,'paidTicketsUsed',d.paid_tickets_used,'replayed',true);
end $$;

create function public.read_owned_mobile_benefit_entry(p_app_user_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare e public.benefit_ticket_entries%rowtype;balance bigint;begin
  perform public.fan_web_lock_active_user(p_app_user_id);select*into e from public.benefit_ticket_entries where idempotency_key=p_request_key and app_user_id=p_app_user_id;if not found then return null;end if;
  select resulting_balance into balance from public.fan_ticket_ledger where id=e.ticket_ledger_id;
  return jsonb_build_object('entryId',e.id,'benefitId',e.benefit_id,'ticketAmount',e.ticket_amount,'ticketLedgerId',e.ticket_ledger_id,'resultingBalance',balance,'replayed',true);
end $$;

create function public.read_owned_mobile_benefit_goods(p_app_user_id uuid,p_locale public.content_locale default 'ko') returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object('items',coalesce((select jsonb_agg(g.item order by g.won_at desc,g.id desc) from (
    select w.selected_at won_at,w.id,jsonb_build_object('id',w.id,'benefitId',w.benefit_id,'title',l.title,'imageUrl',null,'fulfillmentMethod',f.method,'fulfillmentStatus',f.status,'wonAt',w.selected_at) item
      from public.benefit_draw_winners w join public.benefit_fulfillments f on f.winner_id=w.id join public.benefit_localizations l on l.benefit_id=w.benefit_id and l.locale=p_locale where w.app_user_id=p_app_user_id
    union all
    select a.created_at,a.id,jsonb_build_object('id',a.id,'benefitId',a.benefit_id,'title',l.title,'imageUrl',ip.image_url,'fulfillmentMethod',a.fulfillment_method,'fulfillmentStatus',a.fulfillment_status,'wonAt',a.created_at)
      from public.mobile_benefit_awards a join public.mobile_benefit_instant_prizes ip on ip.id=a.prize_id join public.benefit_localizations l on l.benefit_id=a.benefit_id and l.locale=p_locale where a.app_user_id=p_app_user_id
  ) g),'[]'::jsonb));
end $$;

create function public.set_admin_mobile_benefit_policy_enabled(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_policy_id uuid,p_enabled boolean,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare p public.mobile_benefit_policies%rowtype; begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_policy_id is null or p_enabled is null or p_correlation_id is null or length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
  select * into p from public.mobile_benefit_policies where id=p_policy_id and retired_at is null for update;
  if not found then raise exception 'MOBILE_BENEFIT_POLICY_NOT_FOUND'; end if;
  if p_enabled and p.mode='instant_draw' then
    if not exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id) then raise exception 'MOBILE_BENEFIT_POLICY_NO_OUTCOMES'; end if;
    if exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won' and ip.inventory_awarded<>0) then raise exception 'MOBILE_BENEFIT_POLICY_ALREADY_USED'; end if;
    if p.allow_paid_tickets and exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.fulfillment_method in ('physical_shipping','on_site_pickup')) then raise exception 'MOBILE_BENEFIT_PHYSICAL_FREE_ONLY'; end if;
    if exists(select 1 from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.fulfillment_method='digital') then
      if (select delivery_type from public.benefits where id=p.benefit_id)='unique_code' then
        if (select count(*) from public.benefit_unique_codes c where c.benefit_id=p.benefit_id and c.claimed_by_claim_id is null)<(select coalesce(sum(ip.inventory_limit),0) from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id and ip.outcome='won' and ip.fulfillment_method='digital') then raise exception 'MOBILE_BENEFIT_UNIQUE_CODE_INVENTORY_SHORT'; end if;
      elsif not exists(select 1 from public.benefit_delivery_vault v where v.benefit_id=p.benefit_id) then raise exception 'MOBILE_BENEFIT_DIGITAL_DELIVERY_UNAVAILABLE'; end if;
    end if;
    if (select coalesce(sum(ip.weight),0) from public.mobile_benefit_instant_prizes ip where ip.policy_id=p.id)<=0 then raise exception 'MOBILE_BENEFIT_POLICY_INVALID_WEIGHT'; end if;
  end if;
  update public.mobile_benefit_policies set enabled=p_enabled where id=p_policy_id and retired_at is null returning * into p;
  insert into public.mobile_benefit_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,policy_id,correlation_id,detail)
    values(p_actor_app_user_id,p_actor_admin_allowlist_id,case when p_enabled then 'policy_enabled' else 'policy_disabled' end,p.id,p_correlation_id,jsonb_build_object('reason',btrim(p_reason)));
  return jsonb_build_object('policyId',p.id,'enabled',p.enabled,'policyVersion',p.policy_version);
end $$;

-- Reprocessing never rerolls an immutable outcome. It records an operator action
-- and returns the original result for downstream fulfillment repair.
create function public.reprocess_admin_mobile_benefit_draw(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_request_id uuid,p_reason text,p_correlation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare d public.mobile_benefit_draw_requests%rowtype; begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'MOBILE_BENEFIT_ADMIN_INVALID'; end if;
  select * into d from public.mobile_benefit_draw_requests where id=p_request_id;
  if not found then raise exception 'MOBILE_BENEFIT_DRAW_NOT_FOUND'; end if;
  insert into public.mobile_benefit_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,policy_id,draw_request_id,correlation_id,detail)
    values(p_actor_app_user_id,p_actor_admin_allowlist_id,'draw_reprocessed',d.policy_id,d.id,p_correlation_id,jsonb_build_object('reason',btrim(p_reason)));
  return jsonb_build_object('requestId',d.id,'outcome',d.outcome,'prizeId',d.prize_id,'policyVersion',d.policy_version);
end $$;

alter table public.mobile_benefit_policies enable row level security; alter table public.mobile_benefit_policies force row level security;
alter table public.mobile_benefit_instant_prizes enable row level security; alter table public.mobile_benefit_instant_prizes force row level security;
alter table public.mobile_benefit_draw_requests enable row level security; alter table public.mobile_benefit_draw_requests force row level security;
alter table public.mobile_benefit_admin_audits enable row level security; alter table public.mobile_benefit_admin_audits force row level security;
alter table public.mobile_benefit_paid_allocations enable row level security; alter table public.mobile_benefit_paid_allocations force row level security;
alter table public.mobile_benefit_awards enable row level security; alter table public.mobile_benefit_awards force row level security;
alter table public.mobile_benefit_recipient_private enable row level security; alter table public.mobile_benefit_recipient_private force row level security;
revoke all on public.mobile_benefit_policies,public.mobile_benefit_instant_prizes,public.mobile_benefit_draw_requests,public.mobile_benefit_paid_allocations,public.mobile_benefit_awards,public.mobile_benefit_recipient_private,public.mobile_benefit_admin_audits from public,anon,authenticated,service_role;
revoke all on function public.mobile_benefit_require_tester(uuid,boolean),public.mobile_benefit_post_paid_debit(uuid,uuid,uuid,integer),public.read_owned_mobile_benefit_catalog(uuid,text,public.content_locale),public.read_owned_mobile_benefit_tickets(uuid,text),public.read_owned_mobile_benefit_ticket_history(uuid,text,integer),public.read_owned_mobile_benefit_free_ticket_missions(uuid,text),public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz),public.read_owned_mobile_benefit_draw(uuid,uuid),public.read_owned_mobile_benefit_entry(uuid,uuid),public.read_owned_mobile_benefit_goods(uuid,public.content_locale),public.read_owned_mobile_benefit_good(uuid,uuid,public.content_locale),public.save_owned_mobile_benefit_recipient(uuid,uuid,text,text,text,text,text,text,timestamptz),public.read_owned_mobile_benefit_recipient(uuid,uuid),public.read_admin_mobile_benefit_policies(uuid,uuid),public.create_admin_mobile_benefit_policy(uuid,uuid,uuid,text,text,integer,integer,boolean,boolean,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,uuid),public.read_admin_mobile_benefit_operations(uuid,uuid,uuid,integer),public.set_admin_mobile_benefit_policy_enabled(uuid,uuid,uuid,boolean,text,uuid),public.reprocess_admin_mobile_benefit_draw(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mobile_benefit_consent_documents_complete(jsonb),public.read_admin_mobile_benefit_consents(uuid,uuid),public.create_admin_mobile_benefit_consent(uuid,uuid,text,timestamptz,jsonb,text,uuid),public.set_admin_mobile_benefit_consent_active(uuid,uuid,text,boolean,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_admin_mobile_benefit_consents(uuid,uuid),public.create_admin_mobile_benefit_consent(uuid,uuid,text,timestamptz,jsonb,text,uuid),public.set_admin_mobile_benefit_consent_active(uuid,uuid,text,boolean,text,uuid) to service_role;
grant execute on function public.read_owned_mobile_benefit_catalog(uuid,text,public.content_locale),public.read_owned_mobile_benefit_tickets(uuid,text),public.read_owned_mobile_benefit_ticket_history(uuid,text,integer),public.read_owned_mobile_benefit_free_ticket_missions(uuid,text),public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz),public.read_owned_mobile_benefit_draw(uuid,uuid),public.read_owned_mobile_benefit_entry(uuid,uuid),public.read_owned_mobile_benefit_goods(uuid,public.content_locale),public.read_owned_mobile_benefit_good(uuid,uuid,public.content_locale),public.save_owned_mobile_benefit_recipient(uuid,uuid,text,text,text,text,text,text,timestamptz),public.read_owned_mobile_benefit_recipient(uuid,uuid),public.read_admin_mobile_benefit_policies(uuid,uuid),public.create_admin_mobile_benefit_policy(uuid,uuid,uuid,text,text,integer,integer,boolean,boolean,timestamptz,timestamptz,timestamptz,jsonb,jsonb,text,uuid),public.read_admin_mobile_benefit_operations(uuid,uuid,uuid,integer),public.set_admin_mobile_benefit_policy_enabled(uuid,uuid,uuid,boolean,text,uuid),public.reprocess_admin_mobile_benefit_draw(uuid,uuid,uuid,text,uuid) to service_role;

alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_mobile_benefits;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
  if not public.fan_web_account_erasing(p_app_user_id) then raise exception 'ACCOUNT_DELETION_UNAVAILABLE'; end if;
  delete from public.mobile_benefit_recipient_private where app_user_id=p_app_user_id;
  -- Immutable accounting and award history is retained under the pseudonymous user id.
  perform public.scrub_account_deletion_before_mobile_benefits(p_app_user_id);
end $$;
revoke all on function public.scrub_account_deletion_before_mobile_benefits(uuid),public.scrub_account_deletion(uuid) from public,anon,authenticated,service_role;
grant execute on function public.scrub_account_deletion(uuid) to service_role;

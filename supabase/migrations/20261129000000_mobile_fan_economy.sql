-- Spendable points are independent of XP. No amounts, prices or policies are seeded.
begin;
create table public.mobile_fan_economy_policies (
 id uuid primary key default extensions.gen_random_uuid(), celebrity_id uuid not null references public.celebrities(id),
 version text not null check(length(version) between 1 and 80), kind text not null check(kind in ('earning','exchange','vote','correction')),
 rules jsonb not null check(jsonb_typeof(rules)='object'), effective_at timestamptz not null, retired_at timestamptz,
 unique(celebrity_id,kind,version), check(retired_at is null or retired_at>=effective_at)
);
create unique index mobile_fan_economy_active_policy on public.mobile_fan_economy_policies(celebrity_id,kind) where retired_at is null;
create function public.guard_mobile_fan_economy_policy() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' or (to_jsonb(new)-'retired_at') is distinct from (to_jsonb(old)-'retired_at') or old.retired_at is not null or new.retired_at is null then raise exception 'FAN_ECONOMY_POLICY_IMMUTABLE'; end if;return new;end $$;
create trigger mobile_fan_economy_policy_immutable before update or delete on public.mobile_fan_economy_policies for each row execute function public.guard_mobile_fan_economy_policy();
create table public.mobile_fan_economy_ledger (
 id uuid primary key default extensions.gen_random_uuid(), app_user_id uuid not null references public.app_users(id),celebrity_id uuid not null references public.celebrities(id),
 asset text not null check(asset in ('fan_point','free_vote','paid_vote')), amount bigint not null check(amount<>0),
 source_type text not null check(length(source_type) between 1 and 100),source_id uuid not null,policy_id uuid not null references public.mobile_fan_economy_policies(id),
 owner_sequence bigint not null check(owner_sequence>0),resulting_balance bigint not null check(resulting_balance>=0),created_at timestamptz not null default clock_timestamp(),
 unique(app_user_id,celebrity_id,asset,owner_sequence),unique(app_user_id,celebrity_id,asset,source_type,source_id)
);
create trigger mobile_fan_economy_ledger_immutable before update or delete on public.mobile_fan_economy_ledger for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger mobile_fan_economy_ledger_no_truncate before truncate on public.mobile_fan_economy_ledger for each statement execute function public.reject_fan_ticket_ledger_mutation();
create table public.mobile_fan_economy_activity_receipts (
 id uuid primary key default extensions.gen_random_uuid(),app_user_id uuid not null references public.app_users(id),celebrity_id uuid not null references public.celebrities(id),
 action_key text not null,scope_key text not null,source_id uuid not null,occurred_at timestamptz not null,
 policy_id uuid not null references public.mobile_fan_economy_policies(id),point_ledger_id uuid not null unique references public.mobile_fan_economy_ledger(id),
 unique(app_user_id,celebrity_id,action_key,scope_key)
);
create trigger mobile_fan_economy_activity_immutable before update or delete on public.mobile_fan_economy_activity_receipts for each row execute function public.reject_fan_ticket_ledger_mutation();
create table public.mobile_fan_economy_requests (
 app_user_id uuid not null references public.app_users(id),request_key uuid not null,operation text not null check(operation in('exchange','vote')),
 input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(app_user_id,request_key)
);
create trigger mobile_fan_economy_requests_immutable before update or delete on public.mobile_fan_economy_requests for each row execute function public.reject_fan_ticket_ledger_mutation();
create table public.mobile_fan_gift_projects (
 id uuid primary key default extensions.gen_random_uuid(),celebrity_id uuid not null references public.celebrities(id),title text not null,summary text not null,image_url text,
 secured_budget_krw bigint not null default 0 check(secured_budget_krw>=0),announced_amount_krw bigint check(announced_amount_krw>=0),
 opens_at timestamptz not null,closes_at timestamptz not null,status text not null default 'draft' check(status in('draft','open','closed','delivered')),
 goal bigint check(goal>0),delivery_evidence_url text,check(opens_at<closes_at),check(announced_amount_krw is null or announced_amount_krw<=secured_budget_krw),
 check(status<>'delivered' or delivery_evidence_url is not null)
);
create table public.mobile_fan_gift_votes (
 id uuid primary key,app_user_id uuid not null references public.app_users(id),project_id uuid not null references public.mobile_fan_gift_projects(id),
 source text not null check(source in('free','paid')),quantity bigint not null check(quantity>0),ledger_id uuid not null unique references public.mobile_fan_economy_ledger(id),policy_id uuid not null references public.mobile_fan_economy_policies(id),created_at timestamptz not null default clock_timestamp()
);
create trigger mobile_fan_gift_votes_immutable before update or delete on public.mobile_fan_gift_votes for each row execute function public.reject_fan_ticket_ledger_mutation();
create function public.mobile_fan_economy_favorite(p_owner uuid,p_slug text) returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;begin
 perform public.fan_web_lock_active_user(p_owner);
 select id into target from public.celebrities where slug=p_slug and status='published' and archived_at is null;
 if target is null then raise exception 'FAN_ECONOMY_FAVORITE_UNAVAILABLE';end if;return target;end $$;
create function public.mobile_fan_economy_balance(p_owner uuid,p_creator uuid,p_asset text) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce((select resulting_balance from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset order by owner_sequence desc limit 1),0)::bigint $$;
create function public.mobile_fan_economy_post(p_owner uuid,p_creator uuid,p_asset text,p_amount bigint,p_source_type text,p_source_id uuid,p_policy uuid)
 returns uuid language plpgsql security definer set search_path='' as $$declare previous public.mobile_fan_economy_ledger%rowtype;balance numeric;seq bigint;entry uuid;begin
 perform public.fan_web_lock_active_user(p_owner);
 if p_asset not in('fan_point','free_vote','paid_vote') or p_amount is null or p_amount=0 or p_source_id is null or p_policy is null then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||p_creator,0));
 select * into previous from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset and source_type=p_source_type and source_id=p_source_id;
 if found then if previous.amount<>p_amount or previous.policy_id<>p_policy then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return previous.id;end if;
 select resulting_balance,owner_sequence+1 into balance,seq from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset order by owner_sequence desc limit 1;
 balance:=coalesce(balance,0)+p_amount;seq:=coalesce(seq,1);if balance<0 then raise exception 'FAN_ECONOMY_INSUFFICIENT_BALANCE';end if;
 if balance>9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 if not exists(select 1 from public.mobile_fan_economy_policies where id=p_policy and celebrity_id=p_creator)then raise exception 'FAN_ECONOMY_INVALID';end if;
 insert into public.mobile_fan_economy_ledger(app_user_id,celebrity_id,asset,amount,source_type,source_id,policy_id,owner_sequence,resulting_balance)values(p_owner,p_creator,p_asset,p_amount,p_source_type,p_source_id,p_policy,seq,balance::bigint)returning id into entry;return entry;end $$;
create function public.read_owned_mobile_fan_economy_wallet(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 return jsonb_build_object('celebrityId',creator,'fanPoints',public.mobile_fan_economy_balance(p_app_user_id,creator,'fan_point'),'freeDrawEntries',public.get_fan_ticket_balance(p_app_user_id,creator),'freeVotes',public.mobile_fan_economy_balance(p_app_user_id,creator,'free_vote'),'paidVotes',jsonb_build_object('available',0,'held',0),'legacyPaidDraw',coalesce((select resulting_balance from public.mobile_store_paid_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=creator order by owner_sequence desc limit 1),0),'policy',jsonb_build_object('status','unconfigured'));end $$;
create function public.read_owned_mobile_fan_economy_history(p_app_user_id uuid,p_celebrity_slug text,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);if p_limit is null or p_limit not between 1 and 100 then raise exception 'FAN_ECONOMY_INVALID';end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'asset',asset,'amount',amount,'sourceType',source_type,'sourceId',source_id,'createdAt',created_at)order by created_at desc,id)from(select * from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=creator order by created_at desc,id limit p_limit)entries),'[]'));end $$;
create function public.read_owned_mobile_fan_economy_missions(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);return jsonb_build_object('celebrityId',creator,'policy',jsonb_build_object('status','unconfigured'),'missions','[]'::jsonb);end $$;
create function public.exchange_owned_mobile_fan_economy(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_target text,p_policy_version text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;input jsonb;prior public.mobile_fan_economy_requests%rowtype;policy public.mobile_fan_economy_policies%rowtype;cost bigint;total numeric;point_entry uuid;credit_entry uuid;ticket jsonb;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_key is null or p_target not in('free_draw','free_vote') or p_units is null or p_units not between 1 and 1000 or length(coalesce(p_policy_version,'')) not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'target',p_target,'policyVersion',p_policy_version,'units',p_units);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'exchange' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'exchange',input);
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='exchange' and retired_at is null and effective_at<=at_time;
 if not found then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if policy.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 if policy.rules->>p_target is null then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;cost:=(policy.rules->>p_target)::bigint;if cost<=0 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if p_units>least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000)or(policy.rules->>'dailyLimit' is not null and p_units+coalesce((select sum((r.result->>'units')::integer)from public.mobile_fan_economy_requests r where r.app_user_id=p_app_user_id and r.operation='exchange'and r.result->>'celebrityId'=creator::text and r.created_at>=date_trunc('day',at_time at time zone'Asia/Seoul')at time zone'Asia/Seoul'),0)>(policy.rules->>'dailyLimit')::integer)then raise exception 'FAN_ECONOMY_DAILY_LIMIT';end if;
 total:=cost::numeric*p_units;if total>9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 point_entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'fan_point',-total::bigint,'exchange',p_request_key,policy.id);
 if p_target='free_vote' then credit_entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'free_vote',p_units,'exchange',p_request_key,policy.id);
 else ticket:=public.post_fan_ticket_entry(p_app_user_id,creator,'credit',p_units,'fan_point_exchange',p_request_key,p_request_key,(select policy_version from public.reward_policy_activation where singleton),null,null);credit_entry:=(ticket->>'entryId')::uuid;end if;
 result:=jsonb_build_object('requestKey',p_request_key,'celebrityId',creator,'target',p_target,'units',p_units,'pointsSpent',total::bigint,'pointLedgerId',point_entry,'creditLedgerId',credit_entry,'policyVersion',policy.version,'createdAt',at_time,'replayed',false);
 insert into public.mobile_fan_economy_requests values(p_app_user_id,p_request_key,'exchange',input,result,at_time);return result;end $$;
create function public.read_owned_mobile_fan_economy_request(p_app_user_id uuid,p_request_key uuid,p_operation text)returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);return coalesce((select result||jsonb_build_object('replayed',true)from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key and operation=p_operation),jsonb_build_object('status','unknown'));end $$;
create function public.mobile_fan_gift_project_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',p.id,'celebrityId',p.celebrity_id,'title',p.title,'summary',p.summary,'imageUrl',p.image_url,'securedBudgetKrw',p.secured_budget_krw,'announcedAmountKrw',p.announced_amount_krw,'opensAt',p.opens_at,'closesAt',p.closes_at,'status',p.status,'freeVotes',coalesce((select sum(quantity)from public.mobile_fan_gift_votes where project_id=p.id and source='free'),0),'paidVotes',coalesce((select sum(quantity)from public.mobile_fan_gift_votes where project_id=p.id and source='paid'),0),'goal',p.goal,'influencePolicy',jsonb_build_object('status','unconfigured'),'deliveryEvidenceUrl',p.delivery_evidence_url)from public.mobile_fan_gift_projects p where p.id=p_id and p.status<>'draft' $$;
create function public.read_owned_mobile_fan_gift_projects(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);return jsonb_build_object('items',coalesce((select jsonb_agg(public.mobile_fan_gift_project_json(id)order by opens_at,id)from public.mobile_fan_gift_projects where celebrity_id=creator and status<>'draft'),'[]'));end $$;
create function public.read_owned_mobile_fan_gift_project(p_app_user_id uuid,p_project_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin perform public.fan_web_lock_active_user(p_app_user_id);result:=public.mobile_fan_gift_project_json(p_project_id);if result is null then raise exception 'FAN_ECONOMY_PROJECT_UNAVAILABLE';end if;return result;end $$;
create function public.vote_owned_mobile_fan_gift(p_app_user_id uuid,p_project_id uuid,p_request_key uuid,p_policy_version text,p_source text,p_quantity integer)returns jsonb language plpgsql security definer set search_path='' as $$declare input jsonb;prior public.mobile_fan_economy_requests%rowtype;project public.mobile_fan_gift_projects%rowtype;policy public.mobile_fan_economy_policies%rowtype;entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_source not in('free','paid') or p_quantity is null or p_quantity not between 1 and 1000 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('projectId',p_project_id,'policyVersion',p_policy_version,'source',p_source,'quantity',p_quantity);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'vote' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into project from public.mobile_fan_gift_projects where id=p_project_id and status<>'draft';if not found then raise exception 'FAN_ECONOMY_PROJECT_UNAVAILABLE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_app_user_id||':'||project.celebrity_id,0));
 select * into project from public.mobile_fan_gift_projects where id=p_project_id for update;
 if project.status<>'open' or at_time<project.opens_at or at_time>=project.closes_at then raise exception 'FAN_ECONOMY_PROJECT_CLOSED';end if;
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=project.celebrity_id and kind='vote' and retired_at is null and effective_at<=at_time;
 if not found or p_source='paid' or policy.rules->>'freeEnabled' is distinct from 'true' then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if policy.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 entry:=public.mobile_fan_economy_post(p_app_user_id,project.celebrity_id,'free_vote',-p_quantity,'vote',p_request_key,policy.id);
 insert into public.mobile_fan_gift_votes values(p_request_key,p_app_user_id,project.id,p_source,p_quantity,entry,policy.id,at_time);
 result:=jsonb_build_object('requestKey',p_request_key,'projectId',project.id,'celebrityId',project.celebrity_id,'source',p_source,'quantity',p_quantity,'ledgerId',entry,'policyVersion',policy.version,'createdAt',at_time,'replayed',false);
 insert into public.mobile_fan_economy_requests values(p_app_user_id,p_request_key,'vote',input,result,at_time);return result;end $$;
-- Internal helpers and tables never become direct client mutation APIs.
do $$declare t text;f record;begin
 foreach t in array array['mobile_fan_economy_policies','mobile_fan_economy_ledger','mobile_fan_economy_activity_receipts','mobile_fan_economy_requests','mobile_fan_gift_projects','mobile_fan_gift_votes'] loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and (proname like '%mobile_fan_economy%' or proname like '%mobile_fan_gift%')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname like 'read_owned_%' or f.proname like 'exchange_owned_%' or f.proname like 'vote_owned_%' then execute format('grant execute on function %s to service_role',f.signature);end if;end loop;end $$;

-- Corrections append a decision and optional compensating debit; awards never change.
create table public.mobile_fan_reward_corrections (
 event_id uuid primary key,version text not null check(length(version) between 1 and 80),
 app_user_id uuid not null references public.app_users(id),source_id uuid not null,
 receipt_id uuid references public.mobile_fan_economy_activity_receipts(id),
 original_ledger_id uuid references public.mobile_fan_economy_ledger(id),
 policy_version text,policy_id uuid references public.mobile_fan_economy_policies(id),
 correction_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),
 status text not null check(status in('review','corrected')),reason text not null,
 created_at timestamptz not null default clock_timestamp()
);
create unique index mobile_fan_one_completed_correction on public.mobile_fan_reward_corrections(receipt_id) where status='corrected';
alter table public.mobile_fan_reward_corrections enable row level security;
revoke all on public.mobile_fan_reward_corrections from public,anon,authenticated,service_role;
create trigger mobile_fan_correction_immutable before update or delete on public.mobile_fan_reward_corrections for each row execute function public.reject_fan_ticket_ledger_mutation();
create function public.request_mobile_fan_reward_correction(p_app_user_id uuid,p_source_id uuid,p_event_id uuid,p_version text,p_policy_version text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.mobile_fan_reward_corrections%rowtype; receipt public.mobile_fan_economy_activity_receipts%rowtype;
 original public.mobile_fan_economy_ledger%rowtype; policy public.mobile_fan_economy_policies%rowtype;
 correction uuid; reason text:='policy_absent'; state text:='review';
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_source_id is null or p_event_id is null or p_version is null or length(p_version) not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-correction:'||p_event_id,0));
 select * into prior from public.mobile_fan_reward_corrections where event_id=p_event_id;
 if found then
  if prior.app_user_id<>p_app_user_id or prior.source_id<>p_source_id or prior.version<>p_version or prior.policy_version is distinct from p_policy_version then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
  return to_jsonb(prior)||jsonb_build_object('replayed',true);
 end if;
 select * into receipt from public.mobile_fan_economy_activity_receipts where app_user_id=p_app_user_id and source_id=p_source_id;
 if found then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_app_user_id||':'||receipt.celebrity_id,0));
  select * into original from public.mobile_fan_economy_ledger where id=receipt.point_ledger_id;
  select * into policy from public.mobile_fan_economy_policies where celebrity_id=receipt.celebrity_id and kind='correction' and version=p_policy_version and retired_at is null and effective_at<=clock_timestamp();
  if exists(select 1 from public.mobile_fan_reward_corrections where receipt_id=receipt.id and status='corrected') then reason:='already_corrected';
  elsif policy.id is not null and policy.rules->>'mode'='revoke_unspent_points' then
   -- Fungible points cannot prove which award was spent; any later spend requires review.
   if exists(select 1 from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=receipt.celebrity_id and asset='fan_point' and owner_sequence>original.owner_sequence and amount<0)
      or public.mobile_fan_economy_balance(p_app_user_id,receipt.celebrity_id,'fan_point')<original.amount then reason:='rights_spent';
   else correction:=public.mobile_fan_economy_post(p_app_user_id,receipt.celebrity_id,'fan_point',-original.amount,'correction',p_event_id,policy.id);state:='corrected';reason:='unspent_points_reversed';end if;
  end if;
 else reason:='original_award_absent';end if;
 insert into public.mobile_fan_reward_corrections(event_id,version,app_user_id,source_id,receipt_id,original_ledger_id,policy_version,policy_id,correction_ledger_id,status,reason)
 values(p_event_id,p_version,p_app_user_id,p_source_id,receipt.id,original.id,p_policy_version,policy.id,correction,state,reason) returning * into prior;
 return to_jsonb(prior)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.request_mobile_fan_reward_correction(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_mobile_fan_reward_correction(uuid,uuid,uuid,text,text) to service_role;

create function public.read_owned_mobile_fan_reward_corrections(p_app_user_id uuid,p_source_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.event_id) from public.mobile_fan_reward_corrections c where c.app_user_id=p_app_user_id and c.source_id=p_source_id),'[]'::jsonb);
end $$;
revoke all on function public.read_owned_mobile_fan_reward_corrections(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_owned_mobile_fan_reward_corrections(uuid,uuid) to service_role;
commit;

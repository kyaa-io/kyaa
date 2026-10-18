-- Hearts are a distinct asset. No earning or exchange policy is activated here.
begin;
alter table public.mobile_fan_economy_ledger drop constraint mobile_fan_economy_ledger_asset_check;
alter table public.mobile_fan_economy_ledger add constraint mobile_fan_economy_ledger_asset_check check(asset in('fan_point','free_vote','paid_vote','support_voucher'));
alter table public.mobile_fan_economy_requests drop constraint mobile_fan_economy_requests_operation_check;
alter table public.mobile_fan_economy_requests add constraint mobile_fan_economy_requests_operation_check check(operation in('exchange','vote','support'));
alter table public.mobile_fan_economy_cancellations drop constraint mobile_fan_economy_cancellations_operation_check;
alter table public.mobile_fan_economy_cancellations add constraint mobile_fan_economy_cancellations_operation_check check(operation in('exchange','vote','vote_intent','support'));
create or replace function public.mobile_fan_economy_post(p_owner uuid,p_creator uuid,p_asset text,p_amount bigint,p_source_type text,p_source_id uuid,p_policy uuid)
 returns uuid language plpgsql security definer set search_path='' as $$declare previous public.mobile_fan_economy_ledger%rowtype;balance numeric;seq bigint;entry uuid;begin
 perform public.fan_web_lock_active_user(p_owner);
 if p_asset not in('fan_point','free_vote','paid_vote','support_voucher') or p_amount is null or p_amount=0 or p_source_id is null or p_policy is null then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||p_creator,0));
 select * into previous from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset and source_type=p_source_type and source_id=p_source_id;
 if found then if previous.amount<>p_amount or previous.policy_id<>p_policy then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return previous.id;end if;
 select resulting_balance,owner_sequence+1 into balance,seq from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset order by owner_sequence desc limit 1;
 balance:=coalesce(balance,0)+p_amount;seq:=coalesce(seq,1);if balance<0 then raise exception 'FAN_ECONOMY_INSUFFICIENT_BALANCE';end if;
 if balance>9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 if not exists(select 1 from public.mobile_fan_economy_policies where id=p_policy and celebrity_id=p_creator)then raise exception 'FAN_ECONOMY_INVALID';end if;
 insert into public.mobile_fan_economy_ledger(app_user_id,celebrity_id,asset,amount,source_type,source_id,policy_id,owner_sequence,resulting_balance)values(p_owner,p_creator,p_asset,p_amount,p_source_type,p_source_id,p_policy,seq,balance::bigint)returning id into entry;return entry;end $$;
create or replace function public.exchange_owned_mobile_fan_economy(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_target text,p_policy_version text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;input jsonb;prior public.mobile_fan_economy_requests%rowtype;policy public.mobile_fan_economy_policies%rowtype;cost bigint;total numeric;point_entry uuid;credit_entry uuid;ticket jsonb;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_key is null or p_target not in('free_draw','free_vote','support_voucher') or p_units is null or p_units not between 1 and 1000 or length(coalesce(p_policy_version,'')) not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'target',p_target,'policyVersion',p_policy_version,'units',p_units);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'exchange' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'exchange',input);
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='exchange' and retired_at is null and effective_at<=at_time for share;
 if not found then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if policy.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 if policy.rules->>p_target is null then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;cost:=(policy.rules->>p_target)::bigint;if p_target='support_voucher'and cost<>100 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;if cost<=0 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if p_units>least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000)or(policy.rules->>'dailyLimit' is not null and p_units+coalesce((select sum((r.result->>'units')::integer)from public.mobile_fan_economy_requests r where r.app_user_id=p_app_user_id and r.operation='exchange'and r.result->>'celebrityId'=creator::text and r.created_at>=date_trunc('day',at_time at time zone'Asia/Seoul')at time zone'Asia/Seoul'),0)>(policy.rules->>'dailyLimit')::integer)then raise exception 'FAN_ECONOMY_DAILY_LIMIT';end if;
 total:=cost::numeric*p_units;if total>9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 point_entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'fan_point',-total::bigint,'exchange',p_request_key,policy.id);
 if p_target='free_vote' then credit_entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'free_vote',p_units,'exchange',p_request_key,policy.id);
 elsif p_target='support_voucher'then credit_entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'support_voucher',p_units,'exchange',p_request_key,policy.id);
 else ticket:=public.post_fan_ticket_entry(p_app_user_id,creator,'credit',p_units,'fan_point_exchange',p_request_key,p_request_key,(select policy_version from public.reward_policy_activation where singleton),null,null);credit_entry:=(ticket->>'entryId')::uuid;end if;
 result:=jsonb_build_object('requestKey',p_request_key,'celebrityId',creator,'target',p_target,'units',p_units,'pointsSpent',total::bigint,'pointLedgerId',point_entry,'creditLedgerId',credit_entry,'policyVersion',policy.version,'createdAt',at_time,'replayed',false);
 insert into public.mobile_fan_economy_requests values(p_app_user_id,p_request_key,'exchange',input,result,at_time);return result;end $$;
create or replace function public.cancel_owned_mobile_fan_economy_request(p_app_user_id uuid,p_request_key uuid,p_operation text,p_input jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare prior public.mobile_fan_economy_requests%rowtype;cancelled public.mobile_fan_economy_cancellations%rowtype;intent public.mobile_vote_purchase_intents%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_request_key is null or p_operation not in('exchange','vote','vote_intent','support')or jsonb_typeof(p_input)<>'object'then raise exception 'FAN_ECONOMY_INVALID';end if;
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
create or replace function public.read_owned_mobile_fan_economy_history(p_app_user_id uuid,p_celebrity_slug text,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);if p_limit is null or p_limit not between 1 and 100 then raise exception 'FAN_ECONOMY_INVALID';end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'asset',asset,'amount',amount,'sourceType',source_type,'sourceId',source_id,'createdAt',created_at)order by created_at desc,id)from(select * from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=creator and asset in('fan_point','free_vote','paid_vote') order by created_at desc,id limit p_limit)entries),'[]'));end $$;
create or replace function public.read_owned_mobile_fan_support_history(p_app_user_id uuid,p_celebrity_slug text,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);if p_limit is null or p_limit not between 1 and 100 then raise exception 'FAN_ECONOMY_INVALID';end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'asset',asset,'amount',amount,'sourceType',source_type,'sourceId',source_id,'createdAt',created_at)order by created_at desc,id)from(select * from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=creator order by created_at desc,id limit p_limit)entries),'[]'));end $$;

create function public.read_owned_mobile_fan_support_wallet(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$
declare wallet jsonb;creator uuid;policy jsonb;cost bigint;begin
 wallet:=public.read_owned_mobile_fan_economy_wallet(p_app_user_id,p_celebrity_slug);creator:=(wallet->>'celebrityId')::uuid;policy:=wallet->'policy';
 if policy->>'status'='configured'then
  select (rules->>'support_voucher')::bigint into cost from public.mobile_fan_economy_policies where celebrity_id=creator and kind='exchange'and version=policy->>'version'and retired_at is null;
  policy:=policy||jsonb_build_object('supportVoucherPointCost',case when cost=100 then 100 end,'supportVoucherAmountKrw',case when cost=100 then 100 end);
 end if;
 return wallet||jsonb_build_object('supportVouchers',public.mobile_fan_economy_balance(p_app_user_id,creator,'support_voucher'),'fanPointLedgerSequence',coalesce((select max(owner_sequence)from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=creator and asset='fan_point'),0),'policy',policy);
end $$;

alter table public.mobile_fan_economy_ledger add constraint mobile_fan_support_ledger_identity unique(id,app_user_id,celebrity_id,asset,amount,policy_id,source_id);
create table public.mobile_fan_support_contributions(
 app_user_id uuid not null references public.app_users(id),request_key uuid not null,celebrity_id uuid not null references public.celebrities(id),
 units bigint not null check(units between 1 and 1000),support_krw bigint generated always as(units*100)stored,
 voucher_ledger_id uuid not null unique,policy_id uuid not null references public.mobile_fan_economy_policies(id),created_at timestamptz not null default clock_timestamp(),
 asset text not null default 'support_voucher'check(asset='support_voucher'),ledger_amount bigint generated always as(-units)stored,
 primary key(app_user_id,request_key),
 foreign key(voucher_ledger_id,app_user_id,celebrity_id,asset,ledger_amount,policy_id,request_key)references public.mobile_fan_economy_ledger(id,app_user_id,celebrity_id,asset,amount,policy_id,source_id)
);
create index mobile_fan_support_creator on public.mobile_fan_support_contributions(celebrity_id,created_at,app_user_id);
create trigger mobile_fan_support_immutable before update or delete on public.mobile_fan_support_contributions for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger mobile_fan_support_no_truncate before truncate on public.mobile_fan_support_contributions for each statement execute function public.reject_fan_ticket_ledger_mutation();
alter table public.mobile_fan_support_contributions enable row level security;
alter table public.mobile_fan_support_contributions force row level security;
revoke all on public.mobile_fan_support_contributions from public,anon,authenticated,service_role;

create function public.send_owned_mobile_fan_support(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_policy_version text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare creator uuid;input jsonb;prior public.mobile_fan_economy_requests%rowtype;policy public.mobile_fan_economy_policies%rowtype;entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_key is null or p_units is null or p_units not between 1 and 1000 or length(coalesce(p_policy_version,''))not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'policyVersion',p_policy_version,'units',p_units);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'support'or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'support',input);
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='exchange'and retired_at is null and effective_at<=at_time for share;
 if not found or policy.rules->>'support_voucher' is distinct from '100'then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if policy.version<>p_policy_version then raise exception 'FAN_ECONOMY_POLICY_CHANGED';end if;
 if p_units>least(coalesce((policy.rules->>'maxUnits')::integer,1000),1000)then raise exception 'FAN_ECONOMY_DAILY_LIMIT';end if;
 entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'support_voucher',-p_units::bigint,'support',p_request_key,policy.id);
 insert into public.mobile_fan_support_contributions(app_user_id,request_key,celebrity_id,units,voucher_ledger_id,policy_id,created_at)values(p_app_user_id,p_request_key,creator,p_units,entry,policy.id,at_time);
 result:=jsonb_build_object('requestKey',p_request_key,'celebrityId',creator,'units',p_units,'supportKrw',p_units*100,'voucherLedgerId',entry,'policyVersion',policy.version,'createdAt',at_time,'replayed',false);
 insert into public.mobile_fan_economy_requests values(p_app_user_id,p_request_key,'support',input,result,at_time);return result;
end $$;

-- Public totals use only explicitly public profiles/favorites and the viewer's block graph.
create function public.mobile_fan_public_support(p_viewer uuid)returns setof public.mobile_fan_support_contributions language sql stable security definer set search_path='' as $$
 select s.* from public.mobile_fan_support_contributions s join public.app_users u on u.id=s.app_user_id and u.status='active'
 join public.social_profile_settings p on p.app_user_id=u.id and p.profile_visible
 join public.social_favorite_visibility v on v.app_user_id=u.id and v.celebrity_id=s.celebrity_id and v.visible
 where not public.fan_web_blocked(p_viewer,u.id)
$$;
create function public.read_owned_mobile_fan_support_rankings(p_app_user_id uuid,p_locale public.content_locale default 'ko',p_limit integer default 20,p_offset integer default 0)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'FAN_ECONOMY_INVALID';end if;
 with totals as(select s.celebrity_id,sum(s.units)units,sum(s.support_krw)krw,min(s.created_at)first_sent from public.mobile_fan_public_support(p_app_user_id)s group by s.celebrity_id),ranked as(
 select row_number()over(order by t.units desc,t.first_sent,c.id)rank,c.id,c.slug,coalesce(l.name,c.slug)name,c.image_url,t.units,t.krw from totals t join public.celebrities c on c.id=t.celebrity_id and c.status='published'and c.archived_at is null left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale),page as(select * from ranked order by rank limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('rank',rank,'celebrityId',id,'celebritySlug',slug,'name',name,'imageUrl',image_url,'supportUnits',units,'supportKrw',krw)order by rank)from page),'[]'::jsonb),'nextOffset',case when(select count(*)from ranked)>p_offset+p_limit then p_offset+p_limit end)into result;return result;
end $$;
create function public.read_owned_mobile_fan_support_fans(p_app_user_id uuid,p_celebrity_slug text,p_locale public.content_locale default 'ko',p_limit integer default 20,p_offset integer default 0)returns jsonb language plpgsql security definer set search_path='' as $$
declare creator uuid;result jsonb;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'FAN_ECONOMY_INVALID';end if;
 with totals as(select s.app_user_id,sum(s.units)units,sum(s.support_krw)krw,min(s.created_at)first_sent from public.mobile_fan_public_support(p_app_user_id)s where s.celebrity_id=creator group by s.app_user_id),ranked as(
 select row_number()over(order by t.units desc,t.first_sent,t.app_user_id)rank,t.app_user_id,coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko'then '팬'else 'Fan'end)nickname,public.public_fan_avatar_url(t.app_user_id)avatar_url,t.units,t.krw from totals t left join public.user_profiles p on p.app_user_id=t.app_user_id),page as(select * from ranked order by rank limit p_limit offset p_offset)
 select jsonb_build_object('celebrityId',creator,'items',coalesce((select jsonb_agg(jsonb_build_object('rank',rank,'profileId',app_user_id,'nickname',nickname,'avatarUrl',avatar_url,'supportUnits',units,'supportKrw',krw)order by rank)from page),'[]'::jsonb),'me',jsonb_build_object('rank',(select rank from ranked where app_user_id=p_app_user_id),'supportUnits',coalesce((select sum(units)from public.mobile_fan_support_contributions where app_user_id=p_app_user_id and celebrity_id=creator),0),'supportKrw',coalesce((select sum(support_krw)from public.mobile_fan_support_contributions where app_user_id=p_app_user_id and celebrity_id=creator),0)),'nextOffset',case when(select count(*)from ranked)>p_offset+p_limit then p_offset+p_limit end)into result;return result;
end $$;

create function public.read_owned_mobile_fan_support_reward(p_app_user_id uuid,p_source_id uuid,p_after_sequence bigint,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$
declare reward jsonb;sequence bigint;creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 if exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_app_user_id and source_id=p_source_id and celebrity_id<>creator)then raise exception 'FAN_ECONOMY_INVALID';end if;
 if p_after_sequence is null or p_after_sequence not between 0 and 9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 reward:=public.read_owned_mobile_fan_reward(p_app_user_id,p_source_id);
 select l.owner_sequence into sequence from public.mobile_fan_economy_activity_receipts r join public.mobile_fan_economy_ledger l on l.id=r.point_ledger_id where r.app_user_id=p_app_user_id and r.source_id=p_source_id and r.celebrity_id=creator and l.app_user_id=p_app_user_id and l.asset='fan_point';
 return jsonb_build_object('reward',reward,'ledgerSequence',sequence,'newlyAwarded',coalesce(sequence>p_after_sequence and reward->>'status'='awarded',false));
end $$;

create function public.check_in_mobile_fan_support(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$
declare creator uuid;answer jsonb;source uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 answer:=public.check_in_community_stamp(p_app_user_id,p_celebrity_slug);
 select id into source from public.community_stamps where app_user_id=p_app_user_id and celebrity_id=creator and kind='daily_checkin'and source_key='daily-checkin:'||creator::text||':'||public.community_stamp_kst_date()::text;
 if source is null then raise exception 'FAN_ECONOMY_UNAVAILABLE';end if;
 return jsonb_build_object('awarded',(answer->>'awarded')::boolean,'sourceId',source,'replayed',not(answer->>'awarded')::boolean);
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in('check_in_mobile_fan_support','read_owned_mobile_fan_support_wallet','read_owned_mobile_fan_support_history','send_owned_mobile_fan_support','mobile_fan_public_support','read_owned_mobile_fan_support_rankings','read_owned_mobile_fan_support_fans','read_owned_mobile_fan_support_reward')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname<>'mobile_fan_public_support'then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
commit;

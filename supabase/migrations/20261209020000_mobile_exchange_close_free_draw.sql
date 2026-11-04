-- Point-to-ticket conversion is opened only through the ad-gated group wallet
-- exchange (exchange_owned_group_wallet with an ad session). The mobile exchange
-- keeps free_vote and support_voucher unchanged and no longer credits free_draw.
-- Replays of a free_draw request that already committed still return the stored
-- result (the replay branch runs before the new rejection). The legacy wallet
-- lock that group_wallet.sql injected after the first begin is kept.
create or replace function public.exchange_owned_mobile_fan_economy(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_target text,p_policy_version text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;input jsonb;prior public.mobile_fan_economy_requests%rowtype;policy public.mobile_fan_economy_policies%rowtype;cost bigint;total numeric;point_entry uuid;credit_entry uuid;ticket jsonb;result jsonb;at_time timestamptz:=clock_timestamp();begin perform public.group_wallet_legacy_lock(p_app_user_id);
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_key is null or p_target not in('free_draw','free_vote','support_voucher') or p_units is null or p_units not between 1 and 1000 or length(coalesce(p_policy_version,'')) not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'target',p_target,'policyVersion',p_policy_version,'units',p_units);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'exchange' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'exchange',input);
 if p_target='free_draw' then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
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

revoke all on function public.exchange_owned_mobile_fan_economy(uuid,uuid,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.exchange_owned_mobile_fan_economy(uuid,uuid,text,text,text,integer) to service_role;

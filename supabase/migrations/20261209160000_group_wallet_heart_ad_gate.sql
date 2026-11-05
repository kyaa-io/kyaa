-- Hearts follow the same rewarded-ad exchange as tickets (strategy doc 6.3-6.4, decision Q-HEART-AD).
-- exchange_owned_group_wallet keeps its 7-argument signature, grants and owner; only the body changes:
--   * a heart now needs a granted, unexpired, unconsumed ad session of the same user, consumed in the same
--     transaction as the debit (same checks, same daily cap, same one-session-one-exchange rule as a ticket);
--   * a heart is fixed at 1 unit per ad session, like a ticket (the document gives no other ratio);
--   * a committed heart receipt written before this migration (no adSessionId in its input) still replays
--     its stored result, so recovery of an already-committed legacy request never turns into a conflict;
--   * any new heart request without a session fails with GROUP_WALLET_AD_SESSION_REQUIRED before any ledger write.
begin;
create or replace function public.exchange_owned_group_wallet(p_app_user_id uuid,p_request_key uuid,p_policy_version text,p_target text,p_units integer,p_ad_session_id uuid default null,p_daily_cap integer default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.group_wallet_receipts%rowtype;sess public.group_wallet_ad_sessions%rowtype;input jsonb;point_entry uuid;credit_entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_request_key is null or p_target is null or p_target not in('heart','ticket')or p_units is null or p_units not between 1 and 1000 then raise exception 'GROUP_WALLET_INVALID';end if;
 if p_target='ticket'and p_units<>1 then raise exception 'GROUP_WALLET_INVALID';end if;
 input:=jsonb_build_object('policyVersion',p_policy_version,'target',p_target,'units',p_units,'adSessionId',p_ad_session_id);
 select *into original from public.group_wallet_receipts where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then
  if original.operation<>'exchange'then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;
  if original.input<>input and not(p_target='heart'and not(original.input?'adSessionId')and original.input=input-'adSessionId')then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;
  return original.result||jsonb_build_object('replayed',true);
 end if;
 perform public.group_wallet_assert_new_request(p_app_user_id,p_request_key);
 if p_policy_version is distinct from'group-wallet-v1'then raise exception 'GROUP_WALLET_POLICY_CHANGED';end if;
 if p_units<>1 then raise exception 'GROUP_WALLET_INVALID';end if;
 if p_ad_session_id is null then raise exception 'GROUP_WALLET_AD_SESSION_REQUIRED';end if;
 perform public.group_wallet_ad_need(array[p_daily_cap]);
 select *into sess from public.group_wallet_ad_sessions where id=p_ad_session_id and app_user_id=p_app_user_id for update;
 if not found or sess.consumed_at is not null or sess.voided_at is not null or sess.granted_at is null or sess.expires_at<=at_time then raise exception 'GROUP_WALLET_AD_SESSION_INVALID';end if;
 if public.group_wallet_ad_consumed_today(p_app_user_id)>=p_daily_cap then raise exception 'GROUP_WALLET_AD_DAILY_LIMIT';end if;
 update public.group_wallet_ad_sessions set consumed_at=at_time,consumed_request_key=p_request_key where id=sess.id;
 point_entry:=public.group_wallet_post(p_app_user_id,'fan_point',-(p_units::bigint*100),'group_exchange',p_request_key);
 credit_entry:=public.group_wallet_post(p_app_user_id,case when p_target='heart'then 'support_voucher'else 'ticket'end,p_units,'group_exchange',p_request_key);
 result:=jsonb_build_object('requestKey',p_request_key,'target',p_target,'units',p_units,'pointsSpent',p_units::bigint*100,'pointLedgerId',point_entry,'creditLedgerId',credit_entry,'policyVersion','group-wallet-v1','createdAt',clock_timestamp(),'replayed',false);
 insert into public.group_wallet_receipts values(p_app_user_id,p_request_key,'exchange',input,result,clock_timestamp());return result;
end $$;

-- The mobile exchange credited support_voucher (hearts) from points with no ad session, switch or daily cap.
-- Hearts are now bought only through exchange_owned_group_wallet above. Same shape as the free_draw closure in
-- 20261209020000: the idempotent replay branch still runs first, so a request that already committed before this
-- migration returns its stored result; only new support_voucher requests are refused with the same error as free_draw.
-- Body is the 20261209020000 definition with this one condition changed; signature, owner, search_path and grants are unchanged.
create or replace function public.exchange_owned_mobile_fan_economy(p_app_user_id uuid,p_request_key uuid,p_celebrity_slug text,p_target text,p_policy_version text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;input jsonb;prior public.mobile_fan_economy_requests%rowtype;policy public.mobile_fan_economy_policies%rowtype;cost bigint;total numeric;point_entry uuid;credit_entry uuid;ticket jsonb;result jsonb;at_time timestamptz:=clock_timestamp();begin perform public.group_wallet_legacy_lock(p_app_user_id);
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_request_key is null or p_target not in('free_draw','free_vote','support_voucher') or p_units is null or p_units not between 1 and 1000 or length(coalesce(p_policy_version,'')) not between 1 and 80 then raise exception 'FAN_ECONOMY_INVALID';end if;
 input:=jsonb_build_object('celebritySlug',p_celebrity_slug,'target',p_target,'policyVersion',p_policy_version,'units',p_units);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.operation<>'exchange' or prior.input<>input then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 perform public.mobile_fan_economy_assert_uncancelled(p_app_user_id,p_request_key,'exchange',input);
 if p_target in('free_draw','support_voucher') then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
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
commit;

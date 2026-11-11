-- Sample exchange time after acquiring the wallet lock so expired sessions cannot be consumed.
begin;
create or replace function public.exchange_owned_group_wallet(p_app_user_id uuid,p_request_key uuid,p_policy_version text,p_target text,p_units integer,p_ad_session_id uuid default null,p_daily_cap integer default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.group_wallet_receipts%rowtype;sess public.group_wallet_ad_sessions%rowtype;input jsonb;point_entry uuid;credit_entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 at_time:=clock_timestamp();
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
commit;

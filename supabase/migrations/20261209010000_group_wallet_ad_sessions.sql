-- Server-issued one-time rewarded-ad sessions for the point -> ticket exchange.
-- Web rewarded ads have no server-side verification, so this raises forgery cost and
-- caps damage; it cannot prove an ad was watched. All limits are passed in by the
-- server from configuration. There are no defaults: a missing/non-positive value
-- fails closed (GROUP_WALLET_AD_CONFIG_MISSING). All times are database clock.
begin;
create table public.group_wallet_ad_sessions (
 id uuid primary key default extensions.gen_random_uuid(),
 app_user_id uuid not null references public.app_users(id),
 issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 shown_at timestamptz,
 granted_at timestamptz,
 consumed_at timestamptz,
 consumed_request_key uuid,
 voided_at timestamptz,
 void_reason text check(void_reason in('expired','replaced','too_fast')),
 check((voided_at is null)=(void_reason is null)),
 check(expires_at>issued_at),
 check(shown_at is null or shown_at>=issued_at),
 check(granted_at is null or(shown_at is not null and granted_at>=shown_at)),
 check(consumed_at is null or granted_at is not null),
 check((consumed_at is null)=(consumed_request_key is null)),
 check(consumed_at is null or voided_at is null)
);
-- At most one unused session per account.
create unique index group_wallet_ad_sessions_open on public.group_wallet_ad_sessions(app_user_id) where consumed_at is null and voided_at is null;
create unique index group_wallet_ad_sessions_request on public.group_wallet_ad_sessions(app_user_id,consumed_request_key) where consumed_request_key is not null;
create index group_wallet_ad_sessions_issued on public.group_wallet_ad_sessions(issued_at);
create index group_wallet_ad_sessions_user_issued on public.group_wallet_ad_sessions(app_user_id,issued_at);
create trigger group_wallet_ad_sessions_no_delete before delete on public.group_wallet_ad_sessions for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_wallet_ad_sessions_no_truncate before truncate on public.group_wallet_ad_sessions for each statement execute function public.reject_fan_ticket_ledger_mutation();
alter table public.group_wallet_ad_sessions enable row level security;
alter table public.group_wallet_ad_sessions force row level security;
revoke all on table public.group_wallet_ad_sessions from public,anon,authenticated,service_role;

create function public.group_wallet_ad_day_start()returns timestamptz language sql stable set search_path='' as $$
 select (((clock_timestamp()at time zone'Asia/Seoul')::date)::timestamp)at time zone'Asia/Seoul'
$$;
create function public.group_wallet_ad_consumed_today(p_owner uuid)returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.group_wallet_ad_sessions where app_user_id=p_owner and consumed_at>=public.group_wallet_ad_day_start()
$$;
create function public.group_wallet_ad_need(p_values integer[])returns void language plpgsql immutable set search_path='' as $$
declare v integer;begin
 foreach v in array p_values loop if v is null or v<=0 then raise exception 'GROUP_WALLET_AD_CONFIG_MISSING';end if;end loop;
end $$;

create function public.issue_owned_group_wallet_ad_session(p_app_user_id uuid,p_ttl_seconds integer,p_issue_limit integer,p_issue_window_seconds integer,p_daily_cap integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare cur public.group_wallet_ad_sessions%rowtype;fresh public.group_wallet_ad_sessions%rowtype;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 perform public.group_wallet_ad_need(array[p_ttl_seconds,p_issue_limit,p_issue_window_seconds,p_daily_cap]);
 -- Refuse before any ad when the exchange could not succeed afterwards.
 if public.group_wallet_ad_consumed_today(p_app_user_id)>=p_daily_cap then raise exception 'GROUP_WALLET_AD_DAILY_LIMIT';end if;
 if public.group_wallet_balance(p_app_user_id,'fan_point')<100 then raise exception 'GROUP_WALLET_INSUFFICIENT_BALANCE';end if;
 update public.group_wallet_ad_sessions set voided_at=at_time,void_reason='expired' where app_user_id=p_app_user_id and consumed_at is null and voided_at is null and expires_at<=at_time;
 select *into cur from public.group_wallet_ad_sessions where app_user_id=p_app_user_id and consumed_at is null and voided_at is null;
 -- A watched but unspent session is handed back instead of making the user watch again.
 if found and cur.granted_at is not null then
  return jsonb_build_object('sessionId',cur.id,'status','granted','expiresAt',cur.expires_at);
 end if;
 if (select count(*) from public.group_wallet_ad_sessions where app_user_id=p_app_user_id and issued_at>at_time-make_interval(secs=>p_issue_window_seconds))>=p_issue_limit then raise exception 'GROUP_WALLET_AD_RATE_LIMITED';end if;
 if found then update public.group_wallet_ad_sessions set voided_at=at_time,void_reason='replaced' where id=cur.id;end if;
 insert into public.group_wallet_ad_sessions(app_user_id,issued_at,expires_at)values(p_app_user_id,at_time,at_time+make_interval(secs=>p_ttl_seconds))returning *into fresh;
 return jsonb_build_object('sessionId',fresh.id,'status','issued','expiresAt',fresh.expires_at);
end $$;

create function public.report_owned_group_wallet_ad_session(p_app_user_id uuid,p_session_id uuid,p_event text,p_min_watch_seconds integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare rec public.group_wallet_ad_sessions%rowtype;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_session_id is null or p_event is null or p_event not in('shown','granted')then raise exception 'GROUP_WALLET_INVALID';end if;
 perform public.group_wallet_ad_need(array[p_min_watch_seconds]);
 select *into rec from public.group_wallet_ad_sessions where id=p_session_id and app_user_id=p_app_user_id for update;
 if not found or rec.consumed_at is not null or rec.voided_at is not null or rec.expires_at<=at_time then raise exception 'GROUP_WALLET_AD_SESSION_INVALID';end if;
 if p_event='shown' then
  if rec.shown_at is null then update public.group_wallet_ad_sessions set shown_at=at_time where id=rec.id returning *into rec;end if;
 else
  if rec.shown_at is null then raise exception 'GROUP_WALLET_AD_SESSION_INVALID';end if;
  if rec.granted_at is null then
   -- A reward earlier than the minimum viewing interval is invalid and voids the sess.
   if at_time-rec.shown_at<make_interval(secs=>p_min_watch_seconds) then
    update public.group_wallet_ad_sessions set voided_at=at_time,void_reason='too_fast' where id=rec.id;
    return jsonb_build_object('sessionId',rec.id,'status','invalid','expiresAt',rec.expires_at);
   end if;
   update public.group_wallet_ad_sessions set granted_at=at_time where id=rec.id returning *into rec;
  end if;
 end if;
 return jsonb_build_object('sessionId',rec.id,'status',case when rec.granted_at is not null then 'granted'else 'shown'end,'expiresAt',rec.expires_at);
end $$;

-- Replaces the 5-argument exchange so no ad-less ticket path can survive. Heart
-- exchange keeps its previous behavior; a ticket needs a granted session and is
-- fixed at 1 ticket per sess.
drop function public.exchange_owned_group_wallet(uuid,uuid,text,text,integer);
create function public.exchange_owned_group_wallet(p_app_user_id uuid,p_request_key uuid,p_policy_version text,p_target text,p_units integer,p_ad_session_id uuid default null,p_daily_cap integer default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.group_wallet_receipts%rowtype;sess public.group_wallet_ad_sessions%rowtype;input jsonb;point_entry uuid;credit_entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_request_key is null or p_target is null or p_target not in('heart','ticket')or p_units is null or p_units not between 1 and 1000 then raise exception 'GROUP_WALLET_INVALID';end if;
 if p_target='ticket'and p_units<>1 then raise exception 'GROUP_WALLET_INVALID';end if;
 if p_target='heart'and p_ad_session_id is not null then raise exception 'GROUP_WALLET_INVALID';end if;
 input:=jsonb_build_object('policyVersion',p_policy_version,'target',p_target,'units',p_units)||case when p_target='ticket'then jsonb_build_object('adSessionId',p_ad_session_id)else '{}'::jsonb end;
 select *into original from public.group_wallet_receipts where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if original.operation<>'exchange'or original.input<>input then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return original.result||jsonb_build_object('replayed',true);end if;
 perform public.group_wallet_assert_new_request(p_app_user_id,p_request_key);
 if p_policy_version is distinct from'group-wallet-v1'then raise exception 'GROUP_WALLET_POLICY_CHANGED';end if;
 if p_target='ticket'then
  if p_ad_session_id is null then raise exception 'GROUP_WALLET_AD_SESSION_REQUIRED';end if;
  perform public.group_wallet_ad_need(array[p_daily_cap]);
  select *into sess from public.group_wallet_ad_sessions where id=p_ad_session_id and app_user_id=p_app_user_id for update;
  if not found or sess.consumed_at is not null or sess.voided_at is not null or sess.granted_at is null or sess.expires_at<=at_time then raise exception 'GROUP_WALLET_AD_SESSION_INVALID';end if;
  if public.group_wallet_ad_consumed_today(p_app_user_id)>=p_daily_cap then raise exception 'GROUP_WALLET_AD_DAILY_LIMIT';end if;
  update public.group_wallet_ad_sessions set consumed_at=at_time,consumed_request_key=p_request_key where id=sess.id;
 end if;
 point_entry:=public.group_wallet_post(p_app_user_id,'fan_point',-(p_units::bigint*100),'group_exchange',p_request_key);
 credit_entry:=public.group_wallet_post(p_app_user_id,case when p_target='heart'then 'support_voucher'else 'ticket'end,p_units,'group_exchange',p_request_key);
 result:=jsonb_build_object('requestKey',p_request_key,'target',p_target,'units',p_units,'pointsSpent',p_units::bigint*100,'pointLedgerId',point_entry,'creditLedgerId',credit_entry,'policyVersion','group-wallet-v1','createdAt',clock_timestamp(),'replayed',false);
 insert into public.group_wallet_receipts values(p_app_user_id,p_request_key,'exchange',input,result,clock_timestamp());return result;
end $$;

revoke all on function public.group_wallet_ad_day_start(),public.group_wallet_ad_consumed_today(uuid),public.group_wallet_ad_need(integer[]) from public,anon,authenticated,service_role;
revoke all on function public.issue_owned_group_wallet_ad_session(uuid,integer,integer,integer,integer),public.report_owned_group_wallet_ad_session(uuid,uuid,text,integer),public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.issue_owned_group_wallet_ad_session(uuid,integer,integer,integer,integer),public.report_owned_group_wallet_ad_session(uuid,uuid,text,integer),public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer) to service_role;
commit;

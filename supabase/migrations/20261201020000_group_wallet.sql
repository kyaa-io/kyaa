-- Expand-only: no activation or historical ledger rewrites. Enable only after
-- the release's legacy-writer lock audit and balance/receipt reconciliation.
begin;
create table public.group_wallet_release (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 write_fenced boolean not null default true,
 rewards_start_on date,
 legacy_writers_verified boolean not null default false,
 migration_evidence_sha256 text check(migration_evidence_sha256 ~ '^[0-9a-f]{64}$'),
 check(not enabled or (legacy_writers_verified and migration_evidence_sha256 is not null and rewards_start_on is not null))
);
insert into public.group_wallet_release(singleton) values(true);
create table public.group_wallet_policy (
 version text primary key,
 point_cost integer not null check(point_cost=100),
 daily_points integer not null check(daily_points=10),
 streak_days integer not null check(streak_days=7),
 streak_bonus integer not null check(streak_bonus=20)
);
insert into public.group_wallet_policy values('group-wallet-v1',100,10,7,20);
create trigger group_wallet_policy_immutable before update or delete on public.group_wallet_policy for each row execute function public.reject_fan_ticket_ledger_mutation();

-- Global rows share the original ledgers. Creator remains provenance on old rows.
alter table public.fan_ticket_ledger alter column celebrity_id drop not null;
create unique index group_wallet_ticket_sequence on public.fan_ticket_ledger(app_user_id,owner_sequence) where celebrity_id is null;
create unique index group_wallet_ticket_source on public.fan_ticket_ledger(app_user_id,source_type,source_id) where celebrity_id is null;
alter table public.mobile_fan_economy_ledger alter column celebrity_id drop not null;
alter table public.mobile_fan_economy_ledger alter column policy_id drop not null;
alter table public.mobile_fan_economy_ledger add column group_policy_version text references public.group_wallet_policy(version);
alter table public.mobile_fan_economy_ledger add constraint group_wallet_policy_identity check(
 (celebrity_id is not null and policy_id is not null and group_policy_version is null)
 or (celebrity_id is null and policy_id is null and group_policy_version is not null and asset in('fan_point','support_voucher'))
);
create unique index group_wallet_economy_sequence on public.mobile_fan_economy_ledger(app_user_id,asset,owner_sequence) where celebrity_id is null;
create unique index group_wallet_economy_source on public.mobile_fan_economy_ledger(app_user_id,asset,source_type,source_id) where celebrity_id is null;

create table public.group_wallet_receipts (
 app_user_id uuid not null references public.app_users(id),
 request_key uuid not null,
 operation text not null check(operation in('exchange','check_in','support')),
 input jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(app_user_id,request_key)
);
create trigger group_wallet_receipts_immutable before update or delete on public.group_wallet_receipts for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_wallet_receipts_no_truncate before truncate on public.group_wallet_receipts for each statement execute function public.reject_fan_ticket_ledger_mutation();
create table public.group_wallet_attendance (
 app_user_id uuid not null references public.app_users(id),
 attendance_date date not null,
 streak integer not null check(streak>0),
 points integer not null check(points in(10,30)),
 ledger_id uuid not null unique references public.mobile_fan_economy_ledger(id),
 primary key(app_user_id,attendance_date)
);
create trigger group_wallet_attendance_immutable before update or delete on public.group_wallet_attendance for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_wallet_attendance_no_truncate before truncate on public.group_wallet_attendance for each statement execute function public.reject_fan_ticket_ledger_mutation();

create function public.group_wallet_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select enabled from public.group_wallet_release where singleton
$$;
create function public.group_wallet_lock(p_owner uuid,p_write boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null then raise exception 'GROUP_WALLET_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:'||p_owner,0));
 perform public.fan_web_lock_active_user(p_owner);
 if not exists(select 1 from public.group_wallet_release where singleton and enabled)then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 if p_write and exists(select 1 from public.group_wallet_release where singleton and write_fenced)then raise exception 'GROUP_WALLET_WRITE_FENCED';end if;
end $$;
create function public.group_wallet_balance(p_owner uuid,p_asset text) returns bigint language plpgsql stable security definer set search_path='' as $$
declare value numeric;begin
 if p_asset='ticket'then select coalesce(sum(amount),0)into value from public.fan_ticket_ledger where app_user_id=p_owner;
 elsif p_asset in('fan_point','support_voucher')then select coalesce(sum(amount),0)into value from public.mobile_fan_economy_ledger where app_user_id=p_owner and asset=p_asset;
 else raise exception 'GROUP_WALLET_INVALID';end if;
 if value<0 or value>9007199254740991 then raise exception 'GROUP_WALLET_BALANCE_INVALID';end if;
 return value::bigint;
end $$;
create function public.group_wallet_post(p_owner uuid,p_asset text,p_amount bigint,p_source text,p_source_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare entry uuid;prior_amount bigint;balance numeric;sequence bigint;begin
 perform public.group_wallet_lock(p_owner);
 if p_amount is null or p_amount=0 or p_source_id is null or p_source not in('group_exchange','group_check_in','group_capsule','group_support')or p_asset not in('fan_point','support_voucher','ticket')then raise exception 'GROUP_WALLET_INVALID';end if;
 if p_asset='ticket'then
  select id,amount into entry,prior_amount from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id is null and source_type=p_source and source_id=p_source_id;
 else
  select id,amount into entry,prior_amount from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id is null and asset=p_asset and source_type=p_source and source_id=p_source_id;
 end if;
 if entry is not null then if prior_amount<>p_amount then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return entry;end if;
 balance:=public.group_wallet_balance(p_owner,p_asset)::numeric+p_amount::numeric;
 if balance<0 then raise exception 'GROUP_WALLET_INSUFFICIENT_BALANCE';end if;
 if balance>9007199254740991 then raise exception 'GROUP_WALLET_BALANCE_INVALID';end if;
 if p_asset='ticket'then
  select coalesce(max(owner_sequence),0)+1 into sequence from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id is null;
  insert into public.fan_ticket_ledger(app_user_id,celebrity_id,entry_kind,amount,source_type,source_id,idempotency_key,policy_version,owner_sequence,resulting_balance)
  values(p_owner,null,case when p_amount>0 then 'credit'else 'debit'end,p_amount,p_source,p_source_id,p_source_id,(select policy_version from public.reward_policy_activation where singleton),sequence,balance::bigint)returning id into entry;
 else
  select coalesce(max(owner_sequence),0)+1 into sequence from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id is null and asset=p_asset;
  insert into public.mobile_fan_economy_ledger(app_user_id,celebrity_id,asset,amount,source_type,source_id,policy_id,group_policy_version,owner_sequence,resulting_balance)
  values(p_owner,null,p_asset,p_amount,p_source,p_source_id,null,'group-wallet-v1',sequence,balance::bigint)returning id into entry;
 end if;return entry;
end $$;
create table public.group_wallet_owner_sequences (
 app_user_id uuid primary key references public.app_users(id),
 sequence bigint not null check(sequence>0)
);
alter table public.fan_ticket_ledger add column group_sequence bigint;
alter table public.mobile_fan_economy_ledger add column group_sequence bigint;
create function public.group_wallet_assign_sequence()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.group_wallet_enabled()and(tg_table_name='fan_ticket_ledger'or to_jsonb(new)->>'asset' in('fan_point','support_voucher'))then
  perform public.group_wallet_lock(new.app_user_id);
  new.resulting_balance:=public.group_wallet_balance(new.app_user_id,case when tg_table_name='fan_ticket_ledger'then 'ticket'else to_jsonb(new)->>'asset'end)+new.amount;
  if new.resulting_balance<0 then raise exception 'GROUP_WALLET_INSUFFICIENT_BALANCE';end if;
  insert into public.group_wallet_owner_sequences values(new.app_user_id,1)
  on conflict(app_user_id)do update set sequence=public.group_wallet_owner_sequences.sequence+1
  returning sequence into new.group_sequence;
 end if;return new;
end $$;
create trigger group_wallet_ticket_sequence before insert on public.fan_ticket_ledger for each row execute function public.group_wallet_assign_sequence();
create trigger group_wallet_point_sequence before insert on public.mobile_fan_economy_ledger for each row execute function public.group_wallet_assign_sequence();
create function public.read_owned_group_wallet(p_app_user_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(clock_timestamp()at time zone'Asia/Seoul')::date;streak_count integer;checked boolean;begin
 perform public.group_wallet_lock(p_app_user_id,false);
 select streak,attendance_date=today into streak_count,checked from public.group_wallet_attendance where app_user_id=p_app_user_id and attendance_date>=today-1 order by attendance_date desc limit 1;
 return jsonb_build_object('sequence',coalesce((select sequence from public.group_wallet_owner_sequences where app_user_id=p_app_user_id),0),'points',public.group_wallet_balance(p_app_user_id,'fan_point'),'hearts',public.group_wallet_balance(p_app_user_id,'support_voucher'),'tickets',public.group_wallet_balance(p_app_user_id,'ticket'),'policyVersion','group-wallet-v1','pointCost',100,'rewardsStartOn',(select rewards_start_on from public.group_wallet_release where singleton),'writeFenced',(select write_fenced from public.group_wallet_release where singleton),'attendance',jsonb_build_object('date',today,'checkedIn',coalesce(checked,false),'streak',coalesce(streak_count,0),'nextBonusIn',7-(coalesce(streak_count,0)%7),'days',coalesce((select jsonb_agg(jsonb_build_object('date',attendance_date,'points',points) order by attendance_date)from public.group_wallet_attendance where app_user_id=p_app_user_id and attendance_date>=date_trunc('month',today::timestamp)::date and attendance_date< (date_trunc('month',today::timestamp)+interval '1 month')::date),'[]'::jsonb)));
end $$;
create function public.group_wallet_assert_new_request(p_owner uuid,p_key uuid)returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.mobile_fan_economy_requests where app_user_id=p_owner and request_key=p_key)
 or exists(select 1 from public.mobile_fan_economy_cancellations where app_user_id=p_owner and request_key=p_key)
 or exists(select 1 from public.mobile_vote_purchase_intents where app_user_id=p_owner and request_key=p_key)
 or exists(select 1 from public.fan_ticket_ledger where app_user_id=p_owner and idempotency_key=p_key)then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;
end $$;
create function public.exchange_owned_group_wallet(p_app_user_id uuid,p_request_key uuid,p_policy_version text,p_target text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.group_wallet_receipts%rowtype;input jsonb;point_entry uuid;credit_entry uuid;result jsonb;begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_request_key is null or p_target is null or p_target not in('heart','ticket')or p_units is null or p_units not between 1 and 1000 then raise exception 'GROUP_WALLET_INVALID';end if;
 input:=jsonb_build_object('policyVersion',p_policy_version,'target',p_target,'units',p_units);
 select *into original from public.group_wallet_receipts where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if original.operation<>'exchange'or original.input<>input then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return original.result||jsonb_build_object('replayed',true);end if;
 perform public.group_wallet_assert_new_request(p_app_user_id,p_request_key);
 if p_policy_version is distinct from'group-wallet-v1'then raise exception 'GROUP_WALLET_POLICY_CHANGED';end if;
 point_entry:=public.group_wallet_post(p_app_user_id,'fan_point',-(p_units::bigint*100),'group_exchange',p_request_key);
 credit_entry:=public.group_wallet_post(p_app_user_id,case when p_target='heart'then 'support_voucher'else 'ticket'end,p_units,'group_exchange',p_request_key);
 result:=jsonb_build_object('requestKey',p_request_key,'target',p_target,'units',p_units,'pointsSpent',p_units::bigint*100,'pointLedgerId',point_entry,'creditLedgerId',credit_entry,'policyVersion','group-wallet-v1','createdAt',clock_timestamp(),'replayed',false);
 insert into public.group_wallet_receipts values(p_app_user_id,p_request_key,'exchange',input,result,clock_timestamp());return result;
end $$;
-- Sending keeps the original Creator-linked contribution/FK while spending
-- from the common heart balance. The audit-only policy is never an active
-- Creator exchange policy and cannot alter an existing campaign's terms.
create function public.send_owned_group_wallet_support(p_app_user_id uuid,p_request_key uuid,p_policy_version text,p_celebrity_slug text,p_units integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.group_wallet_receipts%rowtype;input jsonb;creator uuid;policy uuid;entry uuid;result jsonb;at_time timestamptz:=clock_timestamp();begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_request_key is null or p_units is null or p_units not between 1 and 1000 then raise exception 'GROUP_WALLET_INVALID';end if;
 input:=jsonb_build_object('policyVersion',p_policy_version,'celebritySlug',p_celebrity_slug,'units',p_units);
 select *into original from public.group_wallet_receipts where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if original.operation<>'support'or original.input<>input then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return original.result||jsonb_build_object('replayed',true);end if;
 perform public.group_wallet_assert_new_request(p_app_user_id,p_request_key);
 if p_policy_version is distinct from'group-wallet-v1'then raise exception 'GROUP_WALLET_POLICY_CHANGED';end if;
 select id into creator from public.celebrities where slug=p_celebrity_slug and status='published'and archived_at is null and not('brand'=any(roles));
 if creator is null then raise exception 'GROUP_WALLET_TARGET_UNAVAILABLE';end if;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at,retired_at)values(creator,'group-wallet-support-v1','exchange','{"support_voucher":100}',at_time,at_time)on conflict(celebrity_id,kind,version)do nothing;
 select id into policy from public.mobile_fan_economy_policies where celebrity_id=creator and version='group-wallet-support-v1'and kind='exchange'and rules='{"support_voucher":100}'::jsonb and retired_at=effective_at;
 if policy is null then raise exception 'GROUP_WALLET_POLICY_CHANGED';end if;
 entry:=public.mobile_fan_economy_post(p_app_user_id,creator,'support_voucher',-p_units::bigint,'support',p_request_key,policy);
 insert into public.mobile_fan_support_contributions(app_user_id,request_key,celebrity_id,units,voucher_ledger_id,policy_id,created_at)values(p_app_user_id,p_request_key,creator,p_units,entry,policy,at_time);
 result:=jsonb_build_object('requestKey',p_request_key,'celebrityId',creator,'units',p_units,'voucherLedgerId',entry,'policyVersion','group-wallet-v1','createdAt',at_time,'replayed',false);
 insert into public.group_wallet_receipts values(p_app_user_id,p_request_key,'support',input,result,at_time);return result;
end $$;

create function public.check_in_owned_group_wallet(p_app_user_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(clock_timestamp()at time zone'Asia/Seoul')::date;original public.group_wallet_receipts%rowtype;attendance public.group_wallet_attendance%rowtype;streak_count integer;points integer;source uuid;entry uuid;result jsonb;begin
 perform public.group_wallet_lock(p_app_user_id);
 if p_request_key is null then raise exception 'GROUP_WALLET_INVALID';end if;
 select *into original from public.group_wallet_receipts where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if original.operation<>'check_in'then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return original.result||jsonb_build_object('replayed',true);end if;
 perform public.group_wallet_assert_new_request(p_app_user_id,p_request_key);
 if today<(select rewards_start_on from public.group_wallet_release where singleton)then raise exception 'GROUP_WALLET_REWARDS_NOT_STARTED';end if;
 select *into attendance from public.group_wallet_attendance where app_user_id=p_app_user_id and attendance_date=today;
 if found then
  result:=jsonb_build_object('requestKey',p_request_key,'date',today,'pointsAwarded',attendance.points,'streak',attendance.streak,'ledgerId',attendance.ledger_id,'replayed',true);
 else
  select streak+1 into streak_count from public.group_wallet_attendance where app_user_id=p_app_user_id and attendance_date=today-1;
  streak_count:=coalesce(streak_count,1);points:=10+case when streak_count%7=0 then 20 else 0 end;source:=extensions.gen_random_uuid();
  entry:=public.group_wallet_post(p_app_user_id,'fan_point',points,'group_check_in',source);
  insert into public.group_wallet_attendance values(p_app_user_id,today,streak_count,points,entry);
  result:=jsonb_build_object('requestKey',p_request_key,'date',today,'pointsAwarded',points,'streak',streak_count,'ledgerId',entry,'replayed',false);
 end if;
 insert into public.group_wallet_receipts values(p_app_user_id,p_request_key,'check_in','{}',result,clock_timestamp());return result;
end $$;
create function public.read_owned_group_wallet_request(p_app_user_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform public.group_wallet_lock(p_app_user_id,false);
 select r.result into result from public.group_wallet_receipts r where app_user_id=p_app_user_id and request_key=p_request_key;
 if result is not null then return jsonb_build_object('status','committed','result',result);end if;
 if exists(select 1 from public.mobile_fan_economy_requests where app_user_id=p_app_user_id and request_key=p_request_key)or exists(select 1 from public.mobile_fan_economy_cancellations where app_user_id=p_app_user_id and request_key=p_request_key)or exists(select 1 from public.mobile_vote_purchase_intents where app_user_id=p_app_user_id and request_key=p_request_key)or exists(select 1 from public.fan_ticket_ledger where app_user_id=p_app_user_id and idempotency_key=p_request_key)then return jsonb_build_object('status','legacy','requiresOriginalContext',true);end if;
 return jsonb_build_object('status','unknown');
end $$;
create function public.read_owned_group_wallet_history(p_app_user_id uuid,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform public.group_wallet_lock(p_app_user_id,false);
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'GROUP_WALLET_INVALID';end if;
 select jsonb_build_object('entries',coalesce(jsonb_agg(jsonb_build_object('id',id,'asset',asset,'amount',amount,'sourceType',source_type,'sourceId',source_id,'celebrityId',celebrity_id,'createdAt',created_at)order by created_at desc,id),'[]'))into result from(
 select *from(
 select id,asset,amount,source_type,source_id,celebrity_id,created_at from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and asset in('fan_point','support_voucher')
 union all select id,'ticket',amount,source_type,source_id,celebrity_id,created_at from public.fan_ticket_ledger where app_user_id=p_app_user_id
 )all_entries order by created_at desc,id limit p_limit)entries;
 return result;
end $$;

create or replace function public.get_fan_ticket_balance(p_app_user_id uuid,p_celebrity_id uuid)returns bigint language sql stable security definer set search_path='' as $$
 select case when public.group_wallet_enabled()then public.group_wallet_balance(p_app_user_id,'ticket')else coalesce((select resulting_balance from public.fan_ticket_ledger where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id order by owner_sequence desc limit 1),0)::bigint end
$$;
create or replace function public.post_fan_ticket_entry(
  p_app_user_id uuid,
  p_celebrity_id uuid,
  p_entry_kind text,
  p_amount bigint,
  p_source_type text,
  p_source_id uuid,
  p_idempotency_key uuid,
  p_policy_version integer,
  p_setting_revision bigint default null,
  p_reward_setting_revision_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.fan_ticket_ledger%rowtype;
  existing_source public.fan_ticket_ledger%rowtype;
  normalized_source_type text;
  current_balance numeric;
  next_balance numeric;
  next_owner_sequence bigint;
  inserted public.fan_ticket_ledger%rowtype;
begin
  if p_app_user_id is null or p_celebrity_id is null or p_source_id is null
     or p_idempotency_key is null or p_policy_version is null or p_amount is null
     or p_entry_kind is null
     or p_amount = 0 or p_entry_kind not in ('credit', 'debit')
     or (p_entry_kind = 'credit' and p_amount < 0)
     or (p_entry_kind = 'debit' and p_amount > 0)
     or p_setting_revision is not null and p_setting_revision <= 0 then
    raise exception 'PHASE1_TICKET_INVALID';
  end if;
  normalized_source_type := btrim(coalesce(p_source_type, ''));
  if length(normalized_source_type) not between 1 and 100 then
    raise exception 'PHASE1_TICKET_INVALID';
  end if;

  if public.group_wallet_enabled() then perform public.group_wallet_lock(p_app_user_id);end if;

  -- Global request-key lock always comes first. Every writer then takes exactly
  -- one fan/Creator balance lock, preventing overdrafts without cross-Creator contention.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase1:ticket:key:' || p_idempotency_key::text, 0)
  );
  select * into existing
  from public.fan_ticket_ledger ledger
  where ledger.idempotency_key = p_idempotency_key;
  if found then
    if existing.app_user_id <> p_app_user_id
       or existing.celebrity_id <> p_celebrity_id
       or existing.entry_kind <> p_entry_kind
       or existing.amount <> p_amount
       or existing.source_type <> normalized_source_type
       or existing.source_id <> p_source_id
       or existing.policy_version <> p_policy_version
       or existing.setting_revision is distinct from p_setting_revision
       or existing.reward_setting_revision_id is distinct from p_reward_setting_revision_id then
      raise exception 'PHASE1_TICKET_IDEMPOTENCY_CONFLICT' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'entryId', existing.id,
      'amount', existing.amount,
      'balance', existing.resulting_balance,
      'replayed', true,
      'createdAt', existing.created_at
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase1:ticket:balance:' || p_app_user_id::text || ':' || p_celebrity_id::text,
      0
    )
  );

  -- A semantic business source is single-use even if a caller changes its key.
  select * into existing_source
  from public.fan_ticket_ledger ledger
  where ledger.app_user_id = p_app_user_id
    and ledger.celebrity_id = p_celebrity_id
    and ledger.source_type = normalized_source_type
    and ledger.source_id = p_source_id;
  if found then
    raise exception 'PHASE1_TICKET_SOURCE_CONFLICT' using errcode = '23514';
  end if;

  perform 1 from public.app_users where id = p_app_user_id and status = 'active' for share;
  if not found then raise exception 'PHASE1_TICKET_OWNER_UNAVAILABLE'; end if;
  perform 1 from public.celebrities where id = p_celebrity_id and archived_at is null for share;
  if not found then raise exception 'PHASE1_TICKET_CREATOR_UNAVAILABLE'; end if;
  perform 1 from public.reward_policy_versions where version = p_policy_version for share;
  if not found then raise exception 'PHASE1_TICKET_POLICY_UNAVAILABLE'; end if;

  select ledger.resulting_balance, ledger.owner_sequence + 1
    into current_balance, next_owner_sequence
  from public.fan_ticket_ledger ledger
  where ledger.app_user_id = p_app_user_id
    and ledger.celebrity_id = p_celebrity_id
  order by ledger.owner_sequence desc
  limit 1;
  current_balance := coalesce(current_balance, 0);
  next_owner_sequence := coalesce(next_owner_sequence, 1);
  if public.group_wallet_enabled() then current_balance:=public.group_wallet_balance(p_app_user_id,'ticket');end if;
  next_balance := current_balance + p_amount::numeric;
  if next_balance < 0 then
    raise exception 'PHASE1_TICKET_NEGATIVE_BALANCE' using errcode = '23514';
  end if;
  if next_balance > 9223372036854775807 then
    raise exception 'PHASE1_TICKET_BALANCE_OVERFLOW' using errcode = '22003';
  end if;

  insert into public.fan_ticket_ledger(
    app_user_id, celebrity_id, entry_kind, amount, source_type, source_id,
    idempotency_key, policy_version, setting_revision, reward_setting_revision_id,
    owner_sequence, resulting_balance
  ) values (
    p_app_user_id, p_celebrity_id, p_entry_kind, p_amount, normalized_source_type,
    p_source_id, p_idempotency_key, p_policy_version, p_setting_revision,
    p_reward_setting_revision_id, next_owner_sequence, next_balance::bigint
  ) returning * into inserted;

  return jsonb_build_object(
    'entryId', inserted.id,
    'amount', inserted.amount,
    'balance', inserted.resulting_balance,
    'replayed', false,
    'createdAt', inserted.created_at
  );
end;
$$;

create or replace function public.mobile_fan_economy_balance(p_owner uuid,p_creator uuid,p_asset text)returns bigint language sql stable security definer set search_path='' as $$
 select case when public.group_wallet_enabled()and p_asset in('fan_point','support_voucher')then public.group_wallet_balance(p_owner,p_asset)else coalesce((select resulting_balance from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset order by owner_sequence desc limit 1),0)::bigint end
$$;
create or replace function public.mobile_fan_economy_post(p_owner uuid,p_creator uuid,p_asset text,p_amount bigint,p_source_type text,p_source_id uuid,p_policy uuid)
 returns uuid language plpgsql security definer set search_path='' as $$declare previous public.mobile_fan_economy_ledger%rowtype;balance numeric;seq bigint;entry uuid;begin
 if public.group_wallet_enabled()and p_asset in('fan_point','support_voucher')then perform public.group_wallet_lock(p_owner);end if;
 perform public.fan_web_lock_active_user(p_owner);
 if p_asset not in('fan_point','free_vote','paid_vote','support_voucher') or p_amount is null or p_amount=0 or p_source_id is null or p_policy is null then raise exception 'FAN_ECONOMY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||p_creator,0));
 select * into previous from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset and source_type=p_source_type and source_id=p_source_id;
 if found then if previous.amount<>p_amount or previous.policy_id<>p_policy then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;return previous.id;end if;
 select resulting_balance,owner_sequence+1 into balance,seq from public.mobile_fan_economy_ledger where app_user_id=p_owner and celebrity_id=p_creator and asset=p_asset order by owner_sequence desc limit 1;
 if public.group_wallet_enabled()and p_asset in('fan_point','support_voucher')then balance:=public.group_wallet_balance(p_owner,p_asset);end if;
 balance:=coalesce(balance,0)+p_amount;seq:=coalesce(seq,1);if balance<0 then raise exception 'FAN_ECONOMY_INSUFFICIENT_BALANCE';end if;
 if balance>9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 if not exists(select 1 from public.mobile_fan_economy_policies where id=p_policy and celebrity_id=p_creator)then raise exception 'FAN_ECONOMY_INVALID';end if;
 insert into public.mobile_fan_economy_ledger(app_user_id,celebrity_id,asset,amount,source_type,source_id,policy_id,owner_sequence,resulting_balance)values(p_owner,p_creator,p_asset,p_amount,p_source_type,p_source_id,p_policy,seq,balance::bigint)returning id into entry;return entry;end $$;

-- Preserve the committed analytics source check for global ledger rows too.
do $$declare definition text;begin
 select pg_get_functiondef(oid)into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='record_product_event_v1';
 if position('and ledger.celebrity_id = p_celebrity_id;'in definition)=0 then raise exception 'GROUP_WALLET_ANALYTICS_CONTRACT_CHANGED';end if;
 execute replace(definition,'and ledger.celebrity_id = p_celebrity_id;','and ledger.celebrity_id is not distinct from p_celebrity_id;');
end $$;

create function public.group_wallet_legacy_lock(p_owner uuid)returns void language plpgsql security definer set search_path='' as $$begin
 if public.group_wallet_enabled()then perform public.group_wallet_lock(p_owner);end if;
end $$;
-- Current single-owner mutation RPCs acquire the shared campaign barrier and
-- user account before their pre-existing request/campaign/Creator locks.
do $$declare f record;definition text;owner_arg text;begin
 for f in select oid,proname,proargnames from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'apply_owned_mobile_vote_verified','award_fan_ticket_activity','award_mobile_content_first_clip','award_mobile_fan_activity','award_mobile_fan_activity_before_live_participation','award_mobile_fan_activity_v1',
 'create_mobile_content_fan_clip','create_mobile_content_fan_clip_before_stamp','draw_owned_mobile_benefit','draw_owned_mobile_benefit_before_free_source',
 'enter_owned_benefit','enter_owned_benefit_before_creator_fan_gate','enter_owned_benefit_before_free_source','enter_owned_benefit_v2','enter_owned_benefit_v2_before_creator_fan_gate','enter_owned_benefit_without_fulfillment_policy',
 'evaluate_owned_live_journey','evaluate_owned_live_journey_before_reward_source','evaluate_owned_live_journey_fw_37e4ff18',
 'exchange_owned_mobile_fan_economy','live_participation_award','request_mobile_fan_reward_correction','send_owned_mobile_fan_support',
 'submit_owned_live_mission','submit_owned_live_mission_before_fan_web','submit_owned_live_mission_before_reward_source','submit_owned_live_participation','submit_owned_mobile_free_lucky','vote_owned_mobile_fan_gift'
 ])loop
 owner_arg:=case when'p_app_user_id'=any(f.proargnames)then'p_app_user_id'when'p_owner'=any(f.proargnames)then'p_owner'end;
 if owner_arg is null then raise exception 'GROUP_WALLET_LEGACY_OWNER_CHANGED %',f.proname;end if;
 definition:=pg_get_functiondef(f.oid);
 if position('LANGUAGE plpgsql'in definition)=0 then raise exception 'GROUP_WALLET_LEGACY_LANGUAGE_CHANGED %',f.proname;end if;
 execute regexp_replace(definition,'\mbegin\M','begin perform public.group_wallet_legacy_lock('||owner_arg||');','i');
 end loop;
end $$;

-- The shared fan-user owner gate covers table-triggered reward producers too.
-- It takes no write-fence decision so read/recovery calls remain available.
do $$declare definition text;begin
 select pg_get_functiondef(oid)into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='fan_web_lock_active_user';
 execute regexp_replace(definition,'\mbegin\M','begin if public.group_wallet_enabled()then perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(''group-wallet:campaign-barrier'',0));perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''group-wallet:owner:''||p_app_user_id,0));end if;','i');
end $$;
-- An existing daily receipt remains readable; new Creator-scoped check-in
-- producers may not double-award alongside the Kyaa-wide daily policy.
do $$declare f record;definition text;guard text;begin
 guard:='begin if public.group_wallet_enabled()and p_action=''checkin''and p_scope>=(select rewards_start_on::text from public.group_wallet_release where singleton)then return coalesce((select jsonb_build_object(''status'',''awarded'',''asset'',''fan_point'',''amount'',l.amount,''policyVersion'',p.version,''sourceId'',r.source_id,''ledgerId'',l.id)from public.mobile_fan_economy_activity_receipts r join public.mobile_fan_economy_ledger l on l.id=r.point_ledger_id join public.mobile_fan_economy_policies p on p.id=r.policy_id where r.app_user_id=p_owner and r.celebrity_id=p_creator and r.action_key=p_action and r.scope_key=p_scope),jsonb_build_object(''status'',''not_eligible'',''asset'',''fan_point'',''amount'',0,''policyVersion'',null,''sourceId'',null,''ledgerId'',null));end if;';
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname=any(array['award_mobile_fan_activity','award_mobile_fan_activity_before_live_participation','award_mobile_fan_activity_v1'])loop
 definition:=pg_get_functiondef(f.oid);execute regexp_replace(definition,'\mbegin\M',guard,'i');
 end loop;
end $$;

-- Invitation qualification can reward both invitee and inviter. Its three
-- entry points take the exclusive barrier before either user lock; ordinary
-- wallet/legacy writers hold the shared side, preventing reciprocal inversion.
create function public.group_wallet_invitation_lock(p_owner uuid,p_inviter uuid)returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;begin
 if not public.group_wallet_enabled()then return;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
 for owner_id in select distinct id from unnest(array[p_owner,p_inviter])id where id is not null order by id loop
  perform public.group_wallet_lock(owner_id);
 end loop;
end $$;
do $$declare f record;definition text;begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in('submit_owned_quiz_attempt','submit_owned_quiz_attempt_fw_f5930695','redeem_community_stamp_invite')loop
 definition:=pg_get_functiondef(f.oid);
 execute regexp_replace(definition,'\mbegin\M','begin perform public.group_wallet_invitation_lock(p_app_user_id,(select inviter_app_user_id from public.community_stamp_invitation_relations where invitee_app_user_id=p_app_user_id));','i');
 end loop;
end $$;

-- Refunds resolve their owner before locking. Campaign cancellation excludes
-- concurrent entries before taking multiple account locks in deterministic order.
do $$declare f record;definition text;guard text;begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in('post_benefit_entry_refund','cancel_admin_benefit_campaign')loop
 definition:=pg_get_functiondef(f.oid);
 if f.proname='post_benefit_entry_refund'then
 guard:='begin perform public.group_wallet_legacy_lock((select app_user_id from public.benefit_ticket_entries where id=p_entry_id));';
 else
 guard:='begin if public.group_wallet_enabled()then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''group-wallet:campaign-barrier'',0));perform public.group_wallet_lock(e.app_user_id)from(select distinct app_user_id from public.benefit_ticket_entries where campaign_id=p_campaign_id order by app_user_id)e;end if;';
 end if;
 execute regexp_replace(definition,'\mbegin\M',guard,'i');
 end loop;
end $$;

-- All RPCs are server-only. The activation row has no API write grant.
do $$declare t text;f record;begin
 foreach t in array array['group_wallet_release','group_wallet_policy','group_wallet_receipts','group_wallet_attendance','group_wallet_owner_sequences']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and(proname like'group_wallet_%'or proname in('read_owned_group_wallet','exchange_owned_group_wallet','check_in_owned_group_wallet','read_owned_group_wallet_request','read_owned_group_wallet_history','send_owned_group_wallet_support'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('read_owned_group_wallet','exchange_owned_group_wallet','check_in_owned_group_wallet','read_owned_group_wallet_request','read_owned_group_wallet_history','send_owned_group_wallet_support')then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
commit;

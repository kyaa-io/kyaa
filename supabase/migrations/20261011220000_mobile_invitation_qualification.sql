-- Invitation relationships registered after this migration qualify only when
-- the invitee earns their first real fan certification (a quiz pass).

create table public.community_stamp_invitation_policy_versions (
  version integer primary key check (version > 0),
  effective_at timestamptz not null unique,
  milestone_size integer not null check (milestone_size > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table public.community_stamp_invitation_reward_configs (
  invitation_policy_version integer not null
    references public.community_stamp_invitation_policy_versions(version) on delete restrict,
  config_version integer not null check (config_version > 0),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  ticket_amount bigint not null check (ticket_amount > 0),
  reward_policy_version integer not null
    references public.reward_policy_versions(version) on delete restrict,
  effective_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (invitation_policy_version,config_version),
  unique (invitation_policy_version,effective_at)
);

alter table public.community_stamp_invite_redemptions
  add constraint community_stamp_invite_redemptions_relation_key
  unique (id,inviter_app_user_id,invitee_app_user_id);

create table public.community_stamp_invitation_relations (
  redemption_id uuid primary key,
  inviter_app_user_id uuid not null references public.app_users(id) on delete restrict,
  invitee_app_user_id uuid not null unique references public.app_users(id) on delete restrict,
  policy_version integer not null
    references public.community_stamp_invitation_policy_versions(version) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','qualified','cancelled')),
  registered_at timestamptz not null default pg_catalog.clock_timestamp(),
  qualifying_quiz_pass_id uuid unique references public.quiz_passes(id) on delete restrict,
  qualified_at timestamptz,
  qualified_sequence bigint,
  cancelled_at timestamptz,
  constraint community_stamp_invitation_relation_redemption
    foreign key (redemption_id,inviter_app_user_id,invitee_app_user_id)
    references public.community_stamp_invite_redemptions(
      id,inviter_app_user_id,invitee_app_user_id) on delete restrict,
  constraint community_stamp_invitation_relation_state check (
    (status='pending' and qualifying_quiz_pass_id is null and qualified_at is null
      and qualified_sequence is null and cancelled_at is null)
    or (status='qualified' and qualifying_quiz_pass_id is not null and qualified_at is not null
      and qualified_sequence is not null and qualified_sequence > 0 and cancelled_at is null)
    or (status='cancelled' and qualifying_quiz_pass_id is null and qualified_at is null
      and qualified_sequence is null and cancelled_at is not null)
  )
);
create unique index community_stamp_invitation_relations_inviter_sequence_once
  on public.community_stamp_invitation_relations(inviter_app_user_id,qualified_sequence)
  where qualified_sequence is not null;
create index community_stamp_invitation_relations_inviter_status_idx
  on public.community_stamp_invitation_relations(inviter_app_user_id,status,registered_at,redemption_id);

create table public.community_stamp_invitation_milestones (
  id uuid primary key default extensions.gen_random_uuid(),
  inviter_app_user_id uuid not null references public.app_users(id) on delete restrict,
  invitation_policy_version integer not null
    references public.community_stamp_invitation_policy_versions(version) on delete restrict,
  milestone_number bigint not null check (milestone_number > 0),
  qualified_count bigint not null check (qualified_count > 0),
  status text not null default 'pending_configuration'
    check (status in ('pending_configuration','awarded')),
  reward_config_version integer,
  ticket_entry_id uuid unique references public.fan_ticket_ledger(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  awarded_at timestamptz,
  unique (inviter_app_user_id,milestone_number),
  constraint community_stamp_invitation_milestone_config
    foreign key (invitation_policy_version,reward_config_version)
    references public.community_stamp_invitation_reward_configs(
      invitation_policy_version,config_version) on delete restrict,
  constraint community_stamp_invitation_milestone_state check (
    (status='pending_configuration' and reward_config_version is null
      and ticket_entry_id is null and awarded_at is null)
    or (status='awarded' and reward_config_version is not null
      and ticket_entry_id is not null and awarded_at is not null)
  )
);

insert into public.community_stamp_invitation_policy_versions(
  version,effective_at,milestone_size
) values (1,pg_catalog.statement_timestamp(),10);

-- Legacy rows stay untouched. New qualified relationships use their redemption
-- source key, so an inviter can receive one real Stamp for every relationship.
drop index public.community_stamps_global_kind_once;
create unique index community_stamps_global_kind_once
  on public.community_stamps(app_user_id,kind)
  where kind='welcome';

do $$
declare target regprocedure;definition text;needle text:='p_kind in (''welcome'',''invite'')';
begin
  select procedure.oid::regprocedure into target
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
  where namespace.nspname='public'
    and procedure.prosrc like '%p_kind in (''welcome'',''invite'')%'
    and procedure.prosrc like '%community-stamp:%'
    and procedure.prosrc like '%insert into public.community_stamps%';
  if target is null then raise exception 'INVITATION_STAMP_ISSUER_SHAPE_CHANGED'; end if;
  definition:=pg_catalog.pg_get_functiondef(target);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'INVITATION_STAMP_ISSUER_SHAPE_CHANGED';
  end if;
  execute replace(definition,needle,'p_kind=''welcome''');
end $$;

-- The MY collection still presents the first Invite Stamp as the INV-020
-- achievement card. Relationship-level Stamps remain in the canonical ledger.
create or replace function public.get_owned_community_stamps(
  p_app_user_id uuid,p_celebrity_slug text default null
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(item,'{stamps}',coalesce((select jsonb_agg(jsonb_set(entry.stamp,'{mint}',public.effective_fan_action_mint(
    p_app_user_id,'community_stamp',(entry.stamp->>'id')::uuid,entry.stamp->'mint'->>'status',entry.stamp->'mint'->>'txHash',entry.stamp->'mint'->>'tokenId')) order by entry.ordinal)
    from jsonb_array_elements(item->'stamps') with ordinality as entry(stamp,ordinal)
    where entry.stamp->>'kind'<>'invite' or entry.ordinal=(
      select min(invite_entry.ordinal)
      from jsonb_array_elements(item->'stamps') with ordinality as invite_entry(stamp,ordinal)
      where invite_entry.stamp->>'kind'='invite'
    )),'[]'::jsonb))
  from (select public.get_owned_community_stamps_legacy_projection(p_app_user_id,p_celebrity_slug) item) base
$$;

alter table public.community_stamp_invitation_policy_versions enable row level security;
alter table public.community_stamp_invitation_policy_versions force row level security;
alter table public.community_stamp_invitation_reward_configs enable row level security;
alter table public.community_stamp_invitation_reward_configs force row level security;
alter table public.community_stamp_invitation_relations enable row level security;
alter table public.community_stamp_invitation_relations force row level security;
alter table public.community_stamp_invitation_milestones enable row level security;
alter table public.community_stamp_invitation_milestones force row level security;
revoke all on table public.community_stamp_invitation_policy_versions,
  public.community_stamp_invitation_reward_configs,
  public.community_stamp_invitation_relations,
  public.community_stamp_invitation_milestones
  from public,anon,authenticated,service_role;

create function public.reject_community_stamp_invitation_policy_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'community stamp invitation policy is immutable';
end $$;
create trigger community_stamp_invitation_policy_versions_immutable
before update or delete on public.community_stamp_invitation_policy_versions
for each row execute function public.reject_community_stamp_invitation_policy_mutation();
create trigger community_stamp_invitation_policy_versions_reject_truncate
before truncate on public.community_stamp_invitation_policy_versions
for each statement execute function public.reject_community_stamp_invitation_policy_mutation();
create trigger community_stamp_invitation_reward_configs_immutable
before update or delete on public.community_stamp_invitation_reward_configs
for each row execute function public.reject_community_stamp_invitation_policy_mutation();
create trigger community_stamp_invitation_reward_configs_reject_truncate
before truncate on public.community_stamp_invitation_reward_configs
for each statement execute function public.reject_community_stamp_invitation_policy_mutation();

create function public.lock_community_stamp_invitation_users(p_invitee_app_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_inviter uuid;
begin
  select relation.inviter_app_user_id into v_inviter
  from public.community_stamp_invitation_relations relation
  where relation.invitee_app_user_id=p_invitee_app_user_id
    and relation.status='pending';
  if v_inviter is null then
    perform public.fan_web_lock_active_user(p_invitee_app_user_id);
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fan-web-user:'||least(v_inviter::text,p_invitee_app_user_id::text),0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fan-web-user:'||greatest(v_inviter::text,p_invitee_app_user_id::text),0));
  perform public.fan_web_lock_active_user(p_invitee_app_user_id);
  if exists(select 1 from public.app_users where id=v_inviter and status='active') then
    perform public.fan_web_lock_active_user(v_inviter);
  end if;
end $$;

-- The owner RPC already has an account-deletion wrapper. Put the pair lock at
-- its very beginning so the later app-user row lock cannot invert lock order.
do $$
declare
  signature regprocedure:='public.submit_owned_quiz_attempt(uuid,uuid,uuid,text,text,text,text)'::regprocedure;
  definition text;
  needle text:='begin if p_app_user_id is not null then';
  replacement text:='begin perform public.lock_community_stamp_invitation_users(p_app_user_id); '
    ||'if p_app_user_id is not null then';
begin
  definition:=pg_catalog.pg_get_functiondef(signature);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'INVITATION_QUIZ_SUBMIT_SHAPE_CHANGED';
  end if;
  execute replace(definition,needle,replacement);
end $$;

create function public.lock_community_stamp_invitation_before_quiz_pass()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.lock_community_stamp_invitation_users(new.app_user_id);
  return new;
end $$;
create trigger aa_community_stamp_invitation_lock
before insert on public.quiz_passes for each row
execute function public.lock_community_stamp_invitation_before_quiz_pass();

create function public.guard_qualified_community_stamp_invitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_redemption_id uuid;
begin
  if new.kind<>'invite' then return new; end if;
  v_redemption_id:=pg_catalog.split_part(new.source_key,':',2)::uuid;
  if exists(select 1 from public.community_stamp_invitation_relations relation
      where relation.redemption_id=v_redemption_id and relation.status<>'qualified') then
    raise exception 'COMMUNITY_STAMP_INVITE_NOT_QUALIFIED' using errcode='23514';
  end if;
  return new;
end $$;
create trigger community_stamps_guard_qualified_invitation
before insert on public.community_stamps for each row
execute function public.guard_qualified_community_stamp_invitation();

create function public.process_community_stamp_invitation_milestone(
  p_inviter_app_user_id uuid,p_milestone_number bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  milestone public.community_stamp_invitation_milestones%rowtype;
  config public.community_stamp_invitation_reward_configs%rowtype;
  result jsonb;
  entry_id uuid;
begin
  perform public.fan_web_lock_active_user(p_inviter_app_user_id);
  select * into milestone from public.community_stamp_invitation_milestones
  where inviter_app_user_id=p_inviter_app_user_id
    and milestone_number=p_milestone_number for update;
  if not found then
    raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002';
  end if;
  if milestone.status='awarded' then
    return jsonb_build_object('state','qualified_reward_issued','replayed',true);
  end if;
  select * into config from public.community_stamp_invitation_reward_configs
  where invitation_policy_version=milestone.invitation_policy_version
    and effective_at<=pg_catalog.clock_timestamp()
  order by effective_at desc,config_version desc limit 1;
  if not found then
    return jsonb_build_object('state','reward_pending_configuration','replayed',false);
  end if;
  result:=public.post_fan_ticket_entry(
    p_inviter_app_user_id,config.celebrity_id,'credit',config.ticket_amount,
    'invitation_milestone',milestone.id,milestone.id,config.reward_policy_version,null,null);
  entry_id:=(result->>'entryId')::uuid;
  update public.community_stamp_invitation_milestones set
    status='awarded',reward_config_version=config.config_version,
    ticket_entry_id=entry_id,awarded_at=pg_catalog.clock_timestamp()
  where id=milestone.id;
  return jsonb_build_object('state','qualified_reward_issued','replayed',result->'replayed');
end $$;

create function public.qualify_community_stamp_invitation_on_quiz_pass()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  relation public.community_stamp_invitation_relations%rowtype;
  policy public.community_stamp_invitation_policy_versions%rowtype;
  next_sequence bigint;
  v_milestone_number bigint;
begin
  select * into relation from public.community_stamp_invitation_relations
  where invitee_app_user_id=new.app_user_id for update;
  if not found or relation.status<>'pending' then return new; end if;
  if not exists(select 1 from public.app_users
      where id=relation.inviter_app_user_id and status='active') then
    update public.community_stamp_invitation_relations set
      status='cancelled',cancelled_at=pg_catalog.clock_timestamp()
    where redemption_id=relation.redemption_id;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'community-stamp:qualified-invites:'||relation.inviter_app_user_id::text,0));
  select coalesce(max(qualified_sequence),0)+1 into next_sequence
  from public.community_stamp_invitation_relations
  where inviter_app_user_id=relation.inviter_app_user_id;
  update public.community_stamp_invitation_relations set
    status='qualified',qualifying_quiz_pass_id=new.id,qualified_at=new.passed_at,
    qualified_sequence=next_sequence
  where redemption_id=relation.redemption_id;
  perform public.issue_community_stamp(relation.inviter_app_user_id,null,'invite',
    'invite:'||relation.redemption_id::text||':inviter');
  perform public.issue_community_stamp(relation.invitee_app_user_id,null,'invite',
    'invite:'||relation.redemption_id::text||':invitee');
  select * into policy from public.community_stamp_invitation_policy_versions
  where version=relation.policy_version;
  if next_sequence%policy.milestone_size=0 then
    v_milestone_number:=next_sequence/policy.milestone_size;
    insert into public.community_stamp_invitation_milestones(
      inviter_app_user_id,invitation_policy_version,milestone_number,qualified_count)
    values(relation.inviter_app_user_id,relation.policy_version,v_milestone_number,next_sequence)
    on conflict(inviter_app_user_id,milestone_number) do nothing;
  end if;
  for v_milestone_number in
    select pending.milestone_number from public.community_stamp_invitation_milestones pending
    where pending.inviter_app_user_id=relation.inviter_app_user_id
      and pending.status='pending_configuration' order by pending.milestone_number
  loop
    perform public.process_community_stamp_invitation_milestone(
      relation.inviter_app_user_id,v_milestone_number);
  end loop;
  return new;
end $$;
create trigger community_stamp_invitation_qualify
after insert on public.quiz_passes for each row
execute function public.qualify_community_stamp_invitation_on_quiz_pass();

create or replace function public.get_community_stamp_invite_code(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_code text;v_redeemed boolean;v_state text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'community-stamp:invite-code:'||p_app_user_id::text,0));
  select code into v_code from public.community_stamp_invite_codes
    where app_user_id=p_app_user_id;
  while v_code is null loop
    v_code:=upper(encode(extensions.gen_random_bytes(12),'hex'));
    insert into public.community_stamp_invite_codes(app_user_id,code)
      values(p_app_user_id,v_code) on conflict(code) do nothing;
    if not found then v_code:=null; end if;
  end loop;
  select exists(select 1 from public.community_stamp_invite_redemptions redemption
    where redemption.invitee_app_user_id=p_app_user_id) into v_redeemed;
  select case relation.status
    when 'pending' then 'pending_fan_verification'
    when 'qualified' then 'qualified_reward_issued'
    when 'cancelled' then 'registration_cancelled'
  end into v_state from public.community_stamp_invitation_relations relation
  where relation.invitee_app_user_id=p_app_user_id;
  if v_state is null then
    v_state:=case when v_redeemed then 'qualified_reward_issued' else 'none' end;
  end if;
  return jsonb_build_object('code',v_code,'redeemed',v_redeemed,'redemptionState',v_state);
end $$;

create or replace function public.redeem_community_stamp_invite(
  p_app_user_id uuid,p_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_code text:=upper(pg_catalog.btrim(coalesce(p_code,'')));
  v_inviter uuid;
  v_redemption public.community_stamp_invite_redemptions%rowtype;
  v_relation public.community_stamp_invitation_relations%rowtype;
  v_policy_version integer;
begin
  if v_code !~ '^[A-F0-9]{24}$' then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
  end if;
  select code.app_user_id into v_inviter from public.community_stamp_invite_codes code
    where code.code=v_code;
  if v_inviter is null then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE' using errcode='P0001';
  end if;
  if v_inviter=p_app_user_id then
    raise exception 'COMMUNITY_STAMP_SELF_INVITE' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fan-web-user:'||least(v_inviter::text,p_app_user_id::text),0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'fan-web-user:'||greatest(v_inviter::text,p_app_user_id::text),0));
  perform public.fan_web_lock_active_user(v_inviter);
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into v_redemption from public.community_stamp_invite_redemptions
  where invitee_app_user_id=p_app_user_id;
  if found then
    select * into v_relation from public.community_stamp_invitation_relations
      where redemption_id=v_redemption.id;
    if v_redemption.inviter_app_user_id=v_inviter and found then
      return jsonb_build_object('state',case v_relation.status
        when 'pending' then 'pending_fan_verification'
        when 'qualified' then 'qualified_reward_issued'
        else 'registration_cancelled' end);
    end if;
    raise exception 'COMMUNITY_STAMP_ALREADY_REDEEMED' using errcode='23505';
  end if;
  if exists(select 1 from public.community_stamp_invite_redemptions redemption
      where redemption.inviter_app_user_id=p_app_user_id
        and redemption.invitee_app_user_id=v_inviter) then
    raise exception 'COMMUNITY_STAMP_ALREADY_REDEEMED' using errcode='23505';
  end if;
  if exists(select 1 from public.quiz_passes where app_user_id=p_app_user_id) then
    raise exception 'COMMUNITY_STAMP_INVITE_INELIGIBLE' using errcode='23514';
  end if;
  if (select count(*) from public.user_wallets wallet
      where wallet.app_user_id in (p_app_user_id,v_inviter) and wallet.chain_id=91342
        and wallet.provider='privy' and wallet.wallet_type='embedded')<>2 then
    raise exception 'COMMUNITY_STAMP_WALLET_NOT_READY' using errcode='P0001';
  end if;
  select version into v_policy_version
  from public.community_stamp_invitation_policy_versions
  where effective_at<=pg_catalog.clock_timestamp()
  order by effective_at desc,version desc limit 1;
  if v_policy_version is null then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE' using errcode='P0001';
  end if;
  insert into public.community_stamp_invite_redemptions(
    inviter_app_user_id,invitee_app_user_id,invite_code)
  values(v_inviter,p_app_user_id,v_code) returning * into v_redemption;
  insert into public.community_stamp_invitation_relations(
    redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version,registered_at)
  values(v_redemption.id,v_inviter,p_app_user_id,v_policy_version,v_redemption.redeemed_at);
  return jsonb_build_object('state','registered_pending_fan_verification');
end $$;

revoke all on function public.reject_community_stamp_invitation_policy_mutation(),
  public.lock_community_stamp_invitation_users(uuid),
  public.lock_community_stamp_invitation_before_quiz_pass(),
  public.guard_qualified_community_stamp_invitation(),
  public.process_community_stamp_invitation_milestone(uuid,bigint),
  public.qualify_community_stamp_invitation_on_quiz_pass(),
  public.get_community_stamp_invite_code(uuid),
  public.redeem_community_stamp_invite(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_community_stamp_invite_code(uuid),
  public.redeem_community_stamp_invite(uuid,text),
  public.process_community_stamp_invitation_milestone(uuid,bigint)
  to service_role;

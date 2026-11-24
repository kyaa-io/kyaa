-- Execute the function explicitly at cutover, after retiring ticket exchange.
-- Installing the migration alone never moves a balance.
create table public.lucky_ticket_cutover (
  singleton boolean primary key default true check (singleton),
  converted_at timestamptz not null default now()
);
alter table public.lucky_ticket_cutover enable row level security;
revoke all on public.lucky_ticket_cutover from public;

-- The group wallet spans creators. Record both legs against its global
-- account, using the same owner lock and sequence triggers as group_wallet_post.
create function public.post_lucky_ticket_conversion(p_owner uuid, p_tickets bigint, p_source uuid)
returns void language plpgsql set search_path = '' as $$
declare
  source_name text := case when p_tickets < 0 then 'lucky_ticket_cutover' else 'lucky_ticket_cutover_undo' end;
begin
  perform public.group_wallet_lock(p_owner);
  insert into public.fan_ticket_ledger
    (app_user_id, entry_kind, amount, source_type, source_id, idempotency_key,
     policy_version, owner_sequence, resulting_balance)
  select p_owner, case when p_tickets < 0 then 'debit' else 'credit' end,
    p_tickets, source_name, p_source, extensions.gen_random_uuid(),
    (select policy_version from public.reward_policy_activation where singleton),
    coalesce(max(owner_sequence), 0) + 1, public.group_wallet_balance(p_owner,'ticket') + p_tickets
  from public.fan_ticket_ledger where app_user_id = p_owner and celebrity_id is null;
  insert into public.mobile_fan_economy_ledger
    (app_user_id, asset, amount, source_type, source_id, group_policy_version,
     owner_sequence, resulting_balance)
  select p_owner, 'fan_point', -100 * p_tickets, source_name, p_source, 'group-wallet-v1',
    coalesce(max(owner_sequence),0) + 1, public.group_wallet_balance(p_owner,'fan_point') - 100 * p_tickets
  from public.mobile_fan_economy_ledger
  where app_user_id = p_owner and celebrity_id is null and asset = 'fan_point';
end $$;
revoke all on function public.post_lucky_ticket_conversion(uuid,bigint,uuid) from public;

create function public.convert_lucky_ticket_balances() returns void
language plpgsql set search_path = '' as $$
declare
  wallet record;
  policy uuid;
begin
  insert into public.lucky_ticket_cutover default values on conflict do nothing;
  if not found then return; end if;
  lock table public.fan_ticket_ledger in share row exclusive mode;
  if public.group_wallet_enabled() then
    for wallet in
      select app_user_id, sum(amount)::bigint as balance from public.fan_ticket_ledger
      group by app_user_id having sum(amount) > 0 order by app_user_id
    loop
      perform public.post_lucky_ticket_conversion(wallet.app_user_id, -wallet.balance, extensions.gen_random_uuid());
    end loop;
    return;
  end if;
  for wallet in
    select * from (
      select distinct on (app_user_id, celebrity_id) *
      from public.fan_ticket_ledger
      order by app_user_id, celebrity_id, owner_sequence desc
    ) latest where resulting_balance > 0
  loop
    -- A historical policy keeps the active correction policy slot free.
    insert into public.mobile_fan_economy_policies
      (celebrity_id, version, kind, rules, effective_at, retired_at)
    values (wallet.celebrity_id, 'lucky-ticket-cutover-v1', 'correction',
      '{"mileagePerTicket":100}', now(), now())
    on conflict (celebrity_id,kind,version) do nothing;
    select id into strict policy from public.mobile_fan_economy_policies
      where celebrity_id = wallet.celebrity_id and kind = 'correction' and version = 'lucky-ticket-cutover-v1';
    perform public.post_fan_ticket_entry(wallet.app_user_id, wallet.celebrity_id, 'debit',
      -wallet.resulting_balance, 'lucky_ticket_cutover', wallet.id, extensions.gen_random_uuid(), wallet.policy_version);
    perform public.mobile_fan_economy_post(wallet.app_user_id, wallet.celebrity_id, 'fan_point',
      wallet.resulting_balance * 100, 'lucky_ticket_cutover', wallet.id, policy);
  end loop;
end $$;
revoke all on function public.convert_lucky_ticket_balances() from public;
do $$ declare target text; begin
  for target in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')
  loop
    execute format('revoke all on function public.convert_lucky_ticket_balances() from %I', target);
    execute format('revoke all on function public.post_lucky_ticket_conversion(uuid,bigint,uuid) from %I', target);
    execute format('revoke all on public.lucky_ticket_cutover from %I', target);
  end loop;
end $$;

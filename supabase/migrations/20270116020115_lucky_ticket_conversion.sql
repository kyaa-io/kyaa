-- Execute the function explicitly at cutover, after retiring ticket exchange.
-- Installing the migration alone never moves a balance.
create table public.lucky_ticket_cutover (
  singleton boolean primary key default true check (singleton),
  converted_at timestamptz not null default now()
);
alter table public.lucky_ticket_cutover enable row level security;
revoke all on public.lucky_ticket_cutover from public;

create function public.convert_lucky_ticket_balances() returns void
language plpgsql set search_path = '' as $$
declare
  wallet record;
  policy uuid;
begin
  insert into public.lucky_ticket_cutover default values on conflict do nothing;
  if not found then return; end if;
  lock table public.fan_ticket_ledger in share row exclusive mode;
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
    execute format('revoke all on public.lucky_ticket_cutover from %I', target);
  end loop;
end $$;

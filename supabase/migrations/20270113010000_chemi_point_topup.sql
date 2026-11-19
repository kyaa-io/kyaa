-- The existing fan_point balance remains the activity balance used for ticket exchange.
create table public.chemi_point_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id),
  product text not null default 'dev_points_100' check (product = 'dev_points_100'),
  amount_krw integer not null default 1000 check (amount_krw = 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.chemi_paid_point_ledger (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id),
  order_id uuid,
  reason text not null,
  amount integer not null,
  purchase_id uuid,
  created_at timestamptz not null default now(),
  foreign key (order_id, user_id) references public.chemi_point_orders(id, user_id),
  unique (order_id, reason),
  unique (purchase_id),
  check (
    (reason = 'topup' and amount = 100 and order_id is not null and purchase_id is null)
    or (reason = 'cancel' and amount = -100 and order_id is not null and purchase_id is null)
    or (reason = 'chemi_purchase' and amount < 0 and purchase_id is not null and order_id is null)
  )
);
create index chemi_paid_point_ledger_owner on public.chemi_paid_point_ledger(user_id);
create trigger chemi_paid_points_immutable before update or delete on public.chemi_paid_point_ledger
  for each row execute function public.reject_fan_ticket_ledger_mutation();
alter table public.chemi_point_orders enable row level security;
alter table public.chemi_paid_point_ledger enable row level security;
revoke all on public.chemi_point_orders, public.chemi_paid_point_ledger from public, anon, authenticated;

create function public.chemi_point_balances(p_owner uuid)
returns table(activity_points bigint, paid_points bigint, total_points bigint)
language sql stable security definer set search_path = '' as $$
  select activity, paid, activity + paid
  from (select public.group_wallet_balance(p_owner, 'fan_point') as activity,
               coalesce(sum(amount), 0) as paid
        from public.chemi_paid_point_ledger where user_id = p_owner) balances
$$;
revoke all on function public.chemi_point_balances(uuid) from public, anon, authenticated;
grant execute on function public.chemi_point_balances(uuid) to service_role;

-- Caller supplies only a server-verified provider snapshot.
create function public.chemi_settle_point_order(
  p_owner uuid, p_order uuid, p_product text, p_amount integer, p_state text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.group_wallet_lock(p_owner);
  perform 1 from public.chemi_point_orders
    where id = p_order and user_id = p_owner and product = p_product and amount_krw = p_amount
    for update;
  if not found then raise exception 'POINT_ORDER_MISMATCH'; end if;
  if p_state = 'DONE' then
    insert into public.chemi_paid_point_ledger(user_id, order_id, reason, amount)
      values (p_owner, p_order, 'topup', 100) on conflict (order_id, reason) do nothing;
  elsif p_state = 'CANCELED' then
    -- A cancellation can arrive before the approval notification. Record both legs atomically.
    if exists (select 1 from public.chemi_paid_point_ledger where order_id = p_order and reason = 'cancel') then
      return;
    end if;
    insert into public.chemi_paid_point_ledger(user_id, order_id, reason, amount)
      values (p_owner, p_order, 'topup', 100) on conflict (order_id, reason) do nothing;
    if (select paid_points from public.chemi_point_balances(p_owner)) < 100 then
      raise exception 'POINT_REFUND_REVIEW';
    end if;
    insert into public.chemi_paid_point_ledger(user_id, order_id, reason, amount)
      values (p_owner, p_order, 'cancel', -100);
  else
    raise exception 'POINT_ORDER_STATE_INVALID';
  end if;
end
$$;
revoke all on function public.chemi_settle_point_order(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.chemi_settle_point_order(uuid, uuid, text, integer, text) to service_role;

-- Called within the transaction that grants a reading. Return the paid portion;
-- the purchase RPC posts the remaining cost against the activity ledger.
create function public.chemi_debit_paid_points(p_owner uuid, p_purchase uuid, p_cost integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare paid integer;
begin
  if p_cost is null or p_cost <= 0 or p_purchase is null then raise exception 'POINT_PURCHASE_INVALID'; end if;
  perform public.group_wallet_lock(p_owner);
  select -amount into paid from public.chemi_paid_point_ledger
    where user_id = p_owner and purchase_id = p_purchase;
  if found then return paid; end if;
  select least(paid_points, p_cost)::integer into paid from public.chemi_point_balances(p_owner);
  if paid > 0 then
    insert into public.chemi_paid_point_ledger(user_id, purchase_id, reason, amount)
      values (p_owner, p_purchase, 'chemi_purchase', -paid);
  end if;
  return paid;
end
$$;
revoke all on function public.chemi_debit_paid_points(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.chemi_debit_paid_points(uuid, uuid, integer) to service_role;

create function public.chemi_open_point_order(p_owner uuid)
returns uuid language sql security definer set search_path = '' as $$
  insert into public.chemi_point_orders(user_id) values (p_owner) returning id
$$;
create function public.chemi_owned_point_order(p_owner uuid, p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chemi_point_orders where user_id=p_owner and id=p_order)
$$;
revoke all on function public.chemi_open_point_order(uuid), public.chemi_owned_point_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chemi_open_point_order(uuid), public.chemi_owned_point_order(uuid, uuid) to service_role;

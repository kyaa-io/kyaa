-- Enable products individually only after the payment and refund flows are ready.
create table public.mileage_topup_products (
  amount_krw integer primary key check (amount_krw > 0),
  mileage integer not null check (mileage > 0),
  enabled boolean not null default false
);

alter table public.mileage_topup_products enable row level security;
revoke all on public.mileage_topup_products from public;
do $$
declare
  client_role text;
begin
  for client_role in select rolname from pg_catalog.pg_roles where rolname in ('anon', 'authenticated')
  loop
    execute format('revoke all on public.mileage_topup_products from %I', client_role);
  end loop;
end
$$;

insert into public.mileage_topup_products (amount_krw, mileage) values
  (1000, 10), (5000, 50), (10000, 100),
  (30000, 330), (50000, 560), (100000, 1150);

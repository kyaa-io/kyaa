begin;

create table public.donation_vote_events (
  slug text primary key,
  starts_at timestamptz,
  ends_at timestamptz not null,
  donation_date date not null,
  check (starts_at < ends_at)
);
insert into public.donation_vote_events values
  ('new-year-2027', null, '2027-01-08 00:00+09', '2027-01-10');

create table public.donation_vote_candidates (
  event_slug text references public.donation_vote_events,
  celebrity_id uuid references public.celebrities,
  fandom_name text,
  primary key (event_slug, celebrity_id)
);
create table public.donation_vote_receipts (
  owner_id uuid not null references public.app_users,
  request_id uuid not null,
  event_slug text not null,
  celebrity_id uuid not null,
  quantity integer not null check (quantity between 1 and 1500),
  vote_day date not null,
  ledger_id uuid not null unique references public.mobile_fan_economy_ledger,
  primary key (owner_id, request_id),
  foreign key (event_slug, celebrity_id) references public.donation_vote_candidates
);
create index donation_vote_daily on public.donation_vote_receipts(owner_id, vote_day);
create index donation_vote_totals on public.donation_vote_receipts(event_slug, celebrity_id);

alter table public.donation_vote_events enable row level security;
alter table public.donation_vote_candidates enable row level security;
alter table public.donation_vote_receipts enable row level security;
revoke all on public.donation_vote_events, public.donation_vote_candidates, public.donation_vote_receipts from public, anon, authenticated, service_role;

do $$
declare definition text := pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure);
begin
  if regexp_count(definition, '''chemi_ask_extra''') <> 1 then raise exception 'wallet source contract changed'; end if;
  execute replace(definition, '''chemi_ask_extra''', '''chemi_ask_extra'',''donation_vote''');
end $$;

create function public.donation_vote_limit(p_user uuid) returns integer
language sql stable security definer set search_path='' as $$
  select coalesce(max(case public.get_fan_effective_tier(p_user, p.celebrity_id)
    when 'Diamond' then 1500 when 'Platinum' then 1000 when 'Gold' then 800
    when 'Silver' then 600 else 500 end), 500)
  from public.fan_passports p where p.app_user_id = p_user
$$;

create function public.cast_donation_vote(p_user uuid, p_request uuid, p_event text, p_creator uuid, p_quantity integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  prior public.donation_vote_receipts;
  ledger uuid;
  today date;
begin
  perform public.group_wallet_lock(p_user);
  select * into prior from public.donation_vote_receipts where owner_id=p_user and request_id=p_request;
  if found then
    if (prior.event_slug, prior.celebrity_id, prior.quantity) is distinct from (p_event,p_creator,p_quantity) then
      raise exception 'VOTE_REQUEST_CONFLICT';
    end if;
    return prior.ledger_id;
  end if;
  perform 1 from public.donation_vote_events e join public.donation_vote_candidates c on c.event_slug=e.slug
    join public.celebrities a on a.id=c.celebrity_id
    where e.slug=p_event and c.celebrity_id=p_creator and a.status='published'
      and a.primary_role::text in ('idol','creator','actor','singer','show_host')
      and clock_timestamp() >= e.starts_at and clock_timestamp() < e.ends_at for share;
  if not found then raise exception 'VOTE_UNAVAILABLE'; end if;
  today := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if p_quantity is null or p_quantity < 1 or p_quantity + (select coalesce(sum(quantity),0)
    from public.donation_vote_receipts where owner_id=p_user and vote_day=today) > public.donation_vote_limit(p_user)
    then raise exception 'VOTE_LIMIT'; end if;
  ledger := public.group_wallet_post(p_user,'fan_point',-p_quantity,'donation_vote',extensions.gen_random_uuid());
  insert into public.donation_vote_receipts values(p_user,p_request,p_event,p_creator,p_quantity,today,ledger);
  return ledger;
end $$;

revoke all on function public.cast_donation_vote(uuid,uuid,text,uuid,integer), public.donation_vote_limit(uuid) from public, anon, authenticated;
grant execute on function public.cast_donation_vote(uuid,uuid,text,uuid,integer), public.donation_vote_limit(uuid) to service_role;
create function public.donation_vote_state(p_user uuid, p_event text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('startsAt',e.starts_at,'endsAt',e.ends_at,'donationDate',e.donation_date,
    'remaining', greatest(0, public.donation_vote_limit(p_user) - (select coalesce(sum(quantity),0)
      from public.donation_vote_receipts where owner_id=p_user and vote_day=public.dukjil_kst_date())),
    'ranking', coalesce((select jsonb_agg(to_jsonb(r) order by r.votes desc,r.slug)
      from (select c.celebrity_id as id, a.slug,c.fandom_name,coalesce(sum(v.quantity),0) as votes
        from public.donation_vote_candidates c join public.celebrities a on a.id=c.celebrity_id
        left join public.donation_vote_receipts v using(event_slug,celebrity_id)
        where c.event_slug=e.slug and a.status='published' and a.primary_role::text in ('idol','creator','actor','singer','show_host')
        group by c.celebrity_id,a.slug,c.fandom_name) r),'[]'::jsonb))
  from public.donation_vote_events e where e.slug=p_event
$$;
revoke all on function public.donation_vote_state(uuid,text) from public, anon, authenticated;
grant execute on function public.donation_vote_state(uuid,text) to service_role;
commit;

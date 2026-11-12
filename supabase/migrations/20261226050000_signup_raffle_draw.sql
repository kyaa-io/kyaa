-- Security follow-up F-03: the signup raffle draw is stored once per event.
-- Before this file POST /api/admin/signup-event drew from the live snapshot with a seed taken from the request, kept nothing and
-- could be repeated until a preferred winner list came out. Now the app server makes the seed, and this function keeps the first
-- draw of an event (seed, seed hash, candidate roster, winners, admin, time). Every later call returns that stored row unchanged.
-- No API role can read or write the table directly, and no function updates or deletes a stored draw.
-- Rollback: supabase/rollback/20261226050000_signup_raffle_draw.sql.
begin;
set local lock_timeout = '5s';
create table public.signup_raffle_draws (
  event_id text primary key check (length(event_id) between 1 and 80),
  seed text not null check (seed ~ '^[a-f0-9]{64}$'),
  seed_sha256 text not null check (seed_sha256 ~ '^[a-f0-9]{64}$'),
  closes_at timestamptz not null,
  drawn_at timestamptz not null default clock_timestamp(),
  drawn_by_app_user_id uuid not null,
  drawn_by_allowlist_id uuid not null,
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array'),
  winners jsonb not null check (jsonb_typeof(winners) = 'array' and jsonb_array_length(winners) between 1 and 1000),
  check (drawn_at > closes_at)
);
alter table public.signup_raffle_draws enable row level security;
alter table public.signup_raffle_draws force row level security;
revoke all on public.signup_raffle_draws from public, anon, authenticated, service_role;

create function public.record_signup_raffle_draw(
  p_event_id text, p_closes_at timestamptz, p_seed text, p_actor uuid, p_allowlist_id uuid, p_candidates jsonb, p_winners jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare stored public.signup_raffle_draws;
begin
  if p_event_id is null or p_closes_at is null or p_seed is null or p_actor is null or p_allowlist_id is null
     or p_candidates is null or p_winners is null then
    raise exception 'SIGNUP_RAFFLE_DRAW_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('signup_raffle_draw:' || p_event_id, 0));
  select * into stored from public.signup_raffle_draws where event_id = p_event_id;
  if not found then
    -- The database clock decides whether the event is over; a draw before the close is refused.
    if pg_catalog.clock_timestamp() <= p_closes_at then raise exception 'SIGNUP_RAFFLE_NOT_CLOSED'; end if;
    insert into public.signup_raffle_draws(event_id, seed, seed_sha256, closes_at, drawn_by_app_user_id, drawn_by_allowlist_id, candidates, winners)
    values (p_event_id, p_seed, pg_catalog.encode(extensions.digest(p_seed, 'sha256'), 'hex'), p_closes_at, p_actor, p_allowlist_id, p_candidates, p_winners)
    returning * into stored;
    return pg_catalog.jsonb_build_object('created', true, 'seedSha256', stored.seed_sha256, 'drawnAt', stored.drawn_at, 'winners', stored.winners);
  end if;
  return pg_catalog.jsonb_build_object('created', false, 'seedSha256', stored.seed_sha256, 'drawnAt', stored.drawn_at, 'winners', stored.winners);
end;
$$;
revoke all on function public.record_signup_raffle_draw(text,timestamptz,text,uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.record_signup_raffle_draw(text,timestamptz,text,uuid,uuid,jsonb,jsonb) to service_role;
commit;
notify pgrst, 'reload schema';

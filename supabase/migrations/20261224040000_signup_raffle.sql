begin;
create table public.signup_raffle_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null unique references public.app_users(id) on delete cascade,
  entered_at timestamptz not null default clock_timestamp(),
  passport_received boolean not null default false,
  community_joined boolean not null default false
);
create table public.signup_raffle_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.signup_raffle_entries(app_user_id) on delete cascade,
  kind text not null check (kind in ('attendance','comment')),
  source_id text not null,
  occurred_at timestamptz not null,
  unique(app_user_id,kind,source_id)
);
alter table public.signup_raffle_entries enable row level security;
alter table public.signup_raffle_entries force row level security;
alter table public.signup_raffle_actions enable row level security;
alter table public.signup_raffle_actions force row level security;
revoke all on public.signup_raffle_entries, public.signup_raffle_actions from public, anon, authenticated;
grant select, insert, update, delete on public.signup_raffle_entries, public.signup_raffle_actions to service_role;
create or replace function public.refresh_signup_raffle_participant(
  p_user_id uuid, p_enter boolean, p_starts_at timestamptz, p_closes_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('signup-raffle:' || p_user_id::text, 0));
  if p_enter then
    if v_now < p_starts_at or v_now > p_closes_at then return false; end if;
    insert into public.signup_raffle_entries(app_user_id,entered_at)
      values(p_user_id,v_now) on conflict(app_user_id) do nothing;
  end if;
  if not exists(select 1 from public.signup_raffle_entries where app_user_id=p_user_id) then return false; end if;
  update public.signup_raffle_entries set
    passport_received=exists(select 1 from public.fan_passports where app_user_id=p_user_id and business_status='issued'),
    community_joined=exists(select 1 from public.group_memberships where app_user_id=p_user_id)
    where app_user_id=p_user_id;
  delete from public.signup_raffle_actions where app_user_id=p_user_id;
  insert into public.signup_raffle_actions(app_user_id,kind,source_id,occurred_at)
  select p_user_id, source.kind, source.source_id, source.occurred_at from (
    select 'attendance'::text kind,'attendance:group_creator_attendance:' || id::text source_id,created_at occurred_at
      from public.group_creator_attendance where app_user_id=p_user_id
    union all
    select 'comment','comment:fan_post_comments:' || id::text,created_at
      from public.fan_post_comments where app_user_id=p_user_id and deleted_at is null and hidden_at is null
    union all
    select 'comment','comment:group_comments:' || id::text,created_at
      from public.group_comments where author_id=p_user_id and removed_at is null
  ) source where source.occurred_at between p_starts_at and p_closes_at;
  return true;
end;
$$;
revoke all on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_signup_raffle_participant(uuid,boolean,timestamptz,timestamptz) to service_role;
-- Aggregate one MVCC snapshot instead of paging rows whose IDs refresh can replace.
create function public.read_signup_raffle_snapshot(
  p_user_id uuid, p_starts_at timestamptz, p_closes_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_snapshot jsonb;
begin
  for v_user in select app_user_id from public.signup_raffle_entries
    where p_user_id is null or app_user_id=p_user_id order by app_user_id
  loop
    perform public.refresh_signup_raffle_participant(v_user,false,p_starts_at,p_closes_at);
  end loop;
  select pg_catalog.jsonb_build_object(
    'users', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',app_user_id,'createdAt',entered_at,'passportReceived',passport_received,'communityJoined',community_joined
    ) order by app_user_id) from public.signup_raffle_entries where p_user_id is null or app_user_id=p_user_id),'[]'::jsonb),
    'entries', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'userId',app_user_id,'enteredAt',entered_at
    ) order by app_user_id) from public.signup_raffle_entries where p_user_id is null or app_user_id=p_user_id),'[]'::jsonb),
    'actions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'userId',app_user_id,'kind',kind,'sourceId',source_id,'occurredAt',occurred_at
    ) order by app_user_id,kind,source_id) from public.signup_raffle_actions where p_user_id is null or app_user_id=p_user_id),'[]'::jsonb)
  ) into v_snapshot;
  return v_snapshot;
end;
$$;
revoke all on function public.read_signup_raffle_snapshot(uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.read_signup_raffle_snapshot(uuid,timestamptz,timestamptz) to service_role;
commit;

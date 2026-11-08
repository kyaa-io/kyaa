-- 261107-2 D11: a fan's tier changes are kept, so the app can celebrate a rise once and the passport can list every change.
--
-- The tier is not stored anywhere: MY and the header compute it on every read (get_fan_effective_tier_for_score with the
-- active policy; under policy 3 that is hearts, three placed stamps and the old level events). fan_level_events only covers
-- the score policy, so a rise to Silver from three stamps left no trace and the fan could not tell when it happened.
--
-- How a change is recorded: observe_fan_tiers(user) computes each passport's tier with the same expression the MY summary uses
-- and appends a row when it differs from the last row. The app calls it when it starts and after every write it makes, so a rise
-- is recorded within one screen of the action that caused it. The first observation of a passport writes a 'start' row
-- (Bronze, at the passport's issue time) and, if the passport is already above Bronze, a 'baseline' row at that moment: the
-- earlier rise happened before this history existed, so it is listed without a celebration and labelled as such by the app.
--
-- seen_at: a rise is celebrated once. mark_fan_tier_changes_seen sets it; drops and baseline rows are born seen.
-- Nobody reaches the table except these functions (service_role executes them for the signed-in owner only).
--
-- Rollback: supabase/rollback/20261215060000_fan_tier_history.sql (roll the web back first; the history is lost).
begin;
set local lock_timeout = '5s';

create table public.fan_tier_history (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  passport_id uuid not null references public.fan_passports(id) on delete cascade,
  kind text not null check (kind in ('start', 'baseline', 'up', 'down')),
  previous_tier text check (previous_tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  tier text not null check (tier in ('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond')),
  occurred_at timestamptz not null default clock_timestamp(),
  seen_at timestamptz,
  constraint fan_tier_history_previous check ((kind = 'start') = (previous_tier is null)),
  constraint fan_tier_history_unseen_only_up check (seen_at is not null or kind = 'up')
);
create index fan_tier_history_passport on public.fan_tier_history (passport_id, occurred_at desc, id desc);
create index fan_tier_history_unseen on public.fan_tier_history (app_user_id) where seen_at is null;

do $$ declare owner_role record; begin
  select rolname, rolsuper, rolbypassrls into owner_role from pg_roles where rolname = current_user;
  alter table public.fan_tier_history enable row level security;
  alter table public.fan_tier_history force row level security;
  revoke all on public.fan_tier_history from public, anon, authenticated, service_role;
  if not owner_role.rolsuper and not owner_role.rolbypassrls then
    execute format('create policy fan_tier_history_owner on public.fan_tier_history for all to %I using (true) with check (true)', owner_role.rolname);
  end if;
end $$;

create function public.fan_tier_rank(p_tier text) returns integer language sql immutable set search_path = '' as $$
  select case p_tier when 'Bronze' then 1 when 'Silver' then 2 when 'Gold' then 3 when 'Platinum' then 4 when 'Diamond' then 5 end
$$;

-- Records changes for every passport of the user and returns the rises not yet celebrated (oldest first), with the
-- creator's slug and name in p_locale. Safe to call often: an unchanged tier writes nothing.
create function public.observe_fan_tiers(p_app_user_id uuid, p_locale public.content_locale default 'ko')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_policy integer;
  p record;
  v_tier text;
  v_last public.fan_tier_history%rowtype;
begin
  if p_app_user_id is null then return jsonb_build_object('changes', '[]'::jsonb); end if;
  -- One observer per user at a time, so two tabs cannot append the same change twice.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-tier-history:' || p_app_user_id::text, 0));
  select policy_version into v_policy from public.reward_policy_activation where singleton;
  -- Without the active policy the badge expression cannot be matched; write nothing rather than a wrong tier (review r4 M2).
  if v_policy is null then return jsonb_build_object('changes', '[]'::jsonb); end if;
  for p in select fp.id, fp.celebrity_id, fp.issued_at from public.fan_passports fp where fp.app_user_id = p_app_user_id loop
    -- The same expression as the MY summary (get_owned_my_fan_activity_before_fan_web), so the history never disagrees with the badge.
    v_tier := public.get_fan_effective_tier_for_score(p_app_user_id, p.celebrity_id,
      coalesce((select sum(points)::integer from public.fan_score_ledger x where x.app_user_id = p_app_user_id and x.celebrity_id = p.celebrity_id), 0), v_policy);
    continue when public.fan_tier_rank(v_tier) is null;
    select * into v_last from public.fan_tier_history h where h.passport_id = p.id order by h.occurred_at desc, h.id desc limit 1;
    if not found then
      insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
      values (p_app_user_id, p.celebrity_id, p.id, 'start', null, 'Bronze', p.issued_at, clock_timestamp());
      if v_tier <> 'Bronze' then
        insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, seen_at)
        values (p_app_user_id, p.celebrity_id, p.id, 'baseline', 'Bronze', v_tier, clock_timestamp());
      end if;
    elsif v_last.tier <> v_tier then
      insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, seen_at)
      values (p_app_user_id, p.celebrity_id, p.id,
        case when public.fan_tier_rank(v_tier) > public.fan_tier_rank(v_last.tier) then 'up' else 'down' end, v_last.tier, v_tier,
        case when public.fan_tier_rank(v_tier) > public.fan_tier_rank(v_last.tier) then null else clock_timestamp() end);
    end if;
  end loop;
  return jsonb_build_object('changes', coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'passportId', h.passport_id, 'slug', c.slug, 'name', coalesce(l.name, ko.name, c.slug),
      'previousTier', h.previous_tier, 'tier', h.tier, 'occurredAt', h.occurred_at) order by h.occurred_at, h.id)
    from public.fan_tier_history h
    join public.celebrities c on c.id = h.celebrity_id
    left join public.celebrity_localizations l on l.celebrity_id = c.id and l.locale = p_locale
    left join public.celebrity_localizations ko on ko.celebrity_id = c.id and ko.locale = 'ko'
    -- A rise that a later drop already undid is not celebrated.
    where h.app_user_id = p_app_user_id and h.seen_at is null
      and not exists (select 1 from public.fan_tier_history later where later.passport_id = h.passport_id
        and (later.occurred_at, later.id) > (h.occurred_at, h.id) and public.fan_tier_rank(later.tier) < public.fan_tier_rank(h.tier))), '[]'::jsonb));
end $$;

-- Marks the given rises of this user as celebrated. Ids of other users are ignored. Returns how many changed.
create function public.mark_fan_tier_changes_seen(p_app_user_id uuid, p_ids uuid[])
returns integer language sql security definer set search_path = '' as $$
  with done as (
    update public.fan_tier_history set seen_at = clock_timestamp()
    where app_user_id = p_app_user_id and id = any(coalesce(p_ids, '{}')) and seen_at is null returning 1
  ) select count(*)::integer from done
$$;

-- The owner's tier history of one passport, newest first. Null when the passport is not the caller's.
create function public.read_fan_tier_history(p_app_user_id uuid, p_passport_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.fan_passports fp where fp.id = p_passport_id and fp.app_user_id = p_app_user_id) then null
    else jsonb_build_object('items', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'previousTier', h.previous_tier, 'tier', h.tier, 'occurredAt', h.occurred_at)
        order by h.occurred_at desc, h.id desc)
      from public.fan_tier_history h where h.passport_id = p_passport_id and h.app_user_id = p_app_user_id), '[]'::jsonb)) end
$$;

revoke all on function public.fan_tier_rank(text), public.observe_fan_tiers(uuid, public.content_locale),
  public.mark_fan_tier_changes_seen(uuid, uuid[]), public.read_fan_tier_history(uuid, uuid) from public, anon, authenticated;
grant execute on function public.observe_fan_tiers(uuid, public.content_locale), public.mark_fan_tier_changes_seen(uuid, uuid[]),
  public.read_fan_tier_history(uuid, uuid) to service_role;

-- owner-policy-begin (review r4b H1)
-- observe_fan_tiers reads the active policy and the tier inputs; get_fan_effective_tier_for_score (invoker) reads milestones, level events and cutover snapshots as this owner.
-- In dev the applying role (byus_admin) owns these functions but is not a superuser, and some tables they read are owned by
-- postgres with FORCE row security and no policy for it: reads answer 0 rows without an error. Same remedy as 20261215030000 and
-- 20261210240000 (p3_fn_owner_<role>): the privilege the functions need and a policy for that role alone, only where row security
-- would otherwise apply to it. A superuser or BYPASSRLS applier (local) needs nothing. Probe: supabase/tests/f_nonsuper_apply.sh.
do $$
declare me record; t record;
begin
  select oid, rolname, rolsuper, rolbypassrls into me from pg_roles where rolname = current_user;
  if me.rolsuper or me.rolbypassrls then return; end if;
  for t in select * from (values ('reward_policy_activation','select'),('reward_policy_tier_milestones','select'),('fan_level_events','select'),('fan_tier_cutover_snapshots','select'),('fan_passports','select'),('fan_score_ledger','select'),('passport_page_slots','select'),('celebrities','select'),('celebrity_localizations','select')) v(tname, privs) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or not pg_has_role(me.oid, c.relowner, 'USAGE')))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and me.oid = any(pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
-- owner-policy-end

-- The tier functions this file calls may belong to another owner than the one applying it (same cause as 20261212030000).
do $$ declare target regprocedure; target_owner name; me name := (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.observe_fan_tiers(uuid,public.content_locale)'::regprocedure);
begin
  foreach target in array array['public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure] loop
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = target;
    if me in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner % for observe_fan_tiers', me; end if;
    if me <> target_owner then execute format('grant execute on function %s to %I', target, me); end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- B3 §5.3: the tier bonus (Silver 30, Gold 100, Platinum 300, Diamond 500 points, once per creator and tier), paid the moment the tier
-- rises.
--
-- Under reward policy 3 a passport's tier is computed from three tables only: creator_heart_ledger (page claims), fan_heart_conversions
-- and passport_page_slots (three filled slots = Silver). An AFTER trigger on each (zzz_fan_tier_sync) calls dukjil_sync_fan_tier in the
-- writing transaction: it compares get_fan_effective_tier with the passport's last fan_tier_history row and appends 'up' or 'down'. The
-- row is always written, whatever the account state. A new fan_passports row gets its 'start' row (zzz_fan_tier_start).
-- On an 'up' with an active policy holding tier_bonus, each tier passed (Silver -> Platinum passes Gold and Platinum) gets one
-- fan_tier_bonus_grants row, unique per member, creator and tier, with the policy version and the points fixed there. A later rise to a
-- tier already granted (after a drop) creates nothing: 0P. A tier the passport had reached before the bonus started (the earliest
-- effective_from of an active or retired policy with tier_bonus) is skipped. An account that is not payable (dukjil_b3_payable) gets
-- the grant as void/account_inactive. A pending grant is paid at once through record_dukjil_action('tier_bonus', 'tier-bonus:<id>');
-- a failed payment leaves it pending (the writing transaction still commits) and retry_fan_tier_bonus_grants (cron, 5 minutes) tries
-- again: 5 minutes, 1 hour, then daily, never giving up. An inactive account or a deleted passport voids it.
-- Locks: the sync takes the wallet keys in the order of group_wallet_lock_target (campaign barrier shared, owner, fan-web-user) and then
-- fan-tier-history, with no account or wallet state check (dukjil_tier_lock), so an admin's void on a restricted member and the
-- multi-member heart conversion keep working. observe_fan_tiers keeps taking only fan-tier-history and never pays.
-- Install: every passport's history is brought to its current tier now (start/baseline for passports without history, a seen
-- 'correction' where the last row differs). All of that is before v2 can take effect, so no tier reached so far earns a bonus.
-- History rows take their time from dukjil_now() (the production clock; tests set it).
-- observe_fan_tiers adds bonusPoints (the paid grants of that history row) to a change that has grants.
--
-- Rollback: supabase/rollback/20261220034000_b3_tier_bonus.sql (pending grants become void/rolled_back; grants and history stay).
begin;
set local lock_timeout = '5s';

-- the table and its guard survive a rollback (paid grants point at ledger rows), so a re-apply finds them
create table if not exists public.fan_tier_bonus_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  passport_id uuid not null references public.fan_passports(id) on delete restrict,
  tier text not null check (tier in ('Silver', 'Gold', 'Platinum', 'Diamond')),
  tier_history_id uuid not null references public.fan_tier_history(id) on delete restrict,
  status text not null check (status in ('pending', 'paid', 'void')),
  policy_version integer not null references public.dukjil_policy_versions(version),
  points integer not null check (points > 0),
  action_log_id uuid references public.dukjil_action_log(id),
  paid_at timestamptz,
  void_reason text check (void_reason in ('account_inactive', 'passport_gone', 'rolled_back')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint fan_tier_bonus_grants_once unique (app_user_id, celebrity_id, tier),
  constraint fan_tier_bonus_grants_paid check ((status = 'paid') = (action_log_id is not null and paid_at is not null)),
  constraint fan_tier_bonus_grants_void check ((status = 'void') = (void_reason is not null))
);
create index if not exists fan_tier_bonus_grants_retry on public.fan_tier_bonus_grants (next_retry_at nulls first, created_at) where status = 'pending';
create index if not exists fan_tier_bonus_grants_history on public.fan_tier_bonus_grants (tier_history_id);

do $$ declare owner_role record; begin
  select rolname, rolsuper, rolbypassrls into owner_role from pg_roles where rolname = current_user;
  alter table public.fan_tier_bonus_grants enable row level security;
  alter table public.fan_tier_bonus_grants force row level security;
  revoke all on public.fan_tier_bonus_grants from public, anon, authenticated, service_role;
  if not owner_role.rolsuper and not owner_role.rolbypassrls then
    execute 'drop policy if exists fan_tier_bonus_grants_owner on public.fan_tier_bonus_grants';
    execute format('create policy fan_tier_bonus_grants_owner on public.fan_tier_bonus_grants for all to %I using (true) with check (true)', owner_role.rolname);
  end if;
end $$;

-- append + status updates of pending rows only
create or replace function public.fan_tier_bonus_grants_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'FAN_TIER_BONUS_IMMUTABLE' using errcode = 'P0001'; end if;
  if new.id <> old.id or new.app_user_id <> old.app_user_id or new.celebrity_id <> old.celebrity_id or new.passport_id <> old.passport_id
     or new.tier <> old.tier or new.tier_history_id <> old.tier_history_id or new.policy_version <> old.policy_version or new.points <> old.points
     or new.created_at <> old.created_at or old.status <> 'pending' then
    raise exception 'FAN_TIER_BONUS_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists fan_tier_bonus_grants_guard on public.fan_tier_bonus_grants;
drop trigger if exists fan_tier_bonus_grants_no_truncate on public.fan_tier_bonus_grants;
create trigger fan_tier_bonus_grants_guard before update or delete on public.fan_tier_bonus_grants
  for each row execute function public.fan_tier_bonus_grants_guard();
create trigger fan_tier_bonus_grants_no_truncate before truncate on public.fan_tier_bonus_grants
  for each statement execute function public.reject_fan_ticket_ledger_mutation();

-- The wallet keys of group_wallet_lock_target, then the tier history key. No account or wallet state check.
create function public.dukjil_tier_lock(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || p_user, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || p_user::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-tier-history:' || p_user::text, 0));
end $$;

-- Pays one pending grant. Never raises for a payment failure: the grant stays pending (or turns void) and says why.
create function public.pay_fan_tier_bonus_grant(p_grant uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare g public.fan_tier_bonus_grants%rowtype; r jsonb; v_state text; v_msg text;
begin
  select * into g from public.fan_tier_bonus_grants where id = p_grant for update;
  if not found then return null; end if;
  if g.status <> 'pending' then return g.status; end if;
  begin
    r := public.record_dukjil_action(g.app_user_id, g.celebrity_id, 'tier_bonus', 'tier-bonus:' || g.id::text,
      pg_catalog.md5('tier-bonus:' || g.id::text)::uuid, '{}'::jsonb);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = '42501' or v_msg like '%FAN_WEB_ACTIVE_ACCOUNT_REQUIRED%' then
      update public.fan_tier_bonus_grants set status = 'void', void_reason = 'account_inactive', last_error = left(v_msg, 200) where id = g.id;
      return 'void';
    elsif v_msg like '%PASSPORT_REQUIRED%' then
      update public.fan_tier_bonus_grants set status = 'void', void_reason = 'passport_gone', last_error = left(v_msg, 200) where id = g.id;
      return 'void';
    end if;
    update public.fan_tier_bonus_grants set attempts = attempts + 1, last_error = left(v_msg, 200),
      next_retry_at = clock_timestamp() + case when attempts = 0 then interval '5 minutes' when attempts = 1 then interval '1 hour' else interval '24 hours' end
     where id = g.id;
    return 'pending';
  end;
  if r ->> 'reason' = 'ACCOUNT_INACTIVE' then
    update public.fan_tier_bonus_grants set status = 'void', void_reason = 'account_inactive' where id = g.id;
    return 'void';
  end if;
  if coalesce((r ->> 'points')::integer, 0) > 0 or coalesce((r ->> 'replayed')::boolean, false) then
    update public.fan_tier_bonus_grants set status = 'paid', action_log_id = (r ->> 'logId')::uuid, paid_at = coalesce((r ->> 'at')::timestamptz, clock_timestamp()),
      last_error = null, next_retry_at = null where id = g.id;
    return 'paid';
  end if;
  update public.fan_tier_bonus_grants set attempts = attempts + 1, last_error = left(coalesce(r ->> 'reason', 'NOT_PAID'), 200),
    next_retry_at = clock_timestamp() + interval '24 hours' where id = g.id;
  return 'pending';
end $$;

-- Records a change of the passport's tier; with p_pay creates and pays the bonus grants of a rise. Returns the new history row id or null.
create function public.dukjil_sync_fan_tier(p_user uuid, p_celebrity uuid, p_pay boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_policy integer; pass public.fan_passports%rowtype; v_tier text; v_last public.fan_tier_history%rowtype; hid uuid; up boolean;
  pol public.dukjil_policy_versions; bonus_start timestamptz; t text; pts integer; gid uuid; payable boolean; v_now timestamptz;
begin
  if p_user is null or p_celebrity is null then return null; end if;
  if p_pay then perform public.dukjil_tier_lock(p_user);
  else perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-tier-history:' || p_user::text, 0)); end if;
  select policy_version into v_policy from public.reward_policy_activation where singleton;
  if v_policy is null then return null; end if;
  select * into pass from public.fan_passports where app_user_id = p_user and celebrity_id = p_celebrity;
  if pass.id is null then return null; end if;
  v_tier := public.get_fan_effective_tier(p_user, p_celebrity);
  if public.fan_tier_rank(v_tier) is null then return null; end if;
  select * into v_last from public.fan_tier_history h where h.passport_id = pass.id order by h.occurred_at desc, h.id desc limit 1;
  v_now := public.dukjil_now();
  if v_last.id is null then
    insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
    values (p_user, p_celebrity, pass.id, 'start', null, 'Bronze', pass.issued_at, v_now);
    if v_tier <> 'Bronze' then
      insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
      values (p_user, p_celebrity, pass.id, 'baseline', 'Bronze', v_tier, greatest(v_now, pass.issued_at), v_now);
    end if;
    return null;
  end if;
  if v_last.tier = v_tier then return null; end if;
  up := public.fan_tier_rank(v_tier) > public.fan_tier_rank(v_last.tier);
  -- one clock for the row (dukjil_now, so a test can set it), never before the row it follows
  insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
  values (p_user, p_celebrity, pass.id, case when up then 'up' else 'down' end, v_last.tier, v_tier, greatest(v_now, v_last.occurred_at),
    case when up then null else v_now end)
  returning id into hid;
  if not up or not p_pay then return hid; end if;

  pol := public.dukjil_active_policy(v_now);
  if pol.version is null or pol.rules #> '{actions,tier_bonus}' is null then return hid; end if;
  select min(v.effective_from) into bonus_start from public.dukjil_policy_versions v
   where v.status in ('active', 'retired') and v.rules #> '{actions,tier_bonus}' is not null;
  payable := public.dukjil_b3_payable(p_user);
  foreach t in array array['Silver', 'Gold', 'Platinum', 'Diamond'] loop
    continue when public.fan_tier_rank(t) <= public.fan_tier_rank(v_last.tier) or public.fan_tier_rank(t) > public.fan_tier_rank(v_tier);
    -- reached before the bonus existed: no bonus for it
    continue when exists (select 1 from public.fan_tier_history h where h.passport_id = pass.id and h.occurred_at < bonus_start
      and public.fan_tier_rank(h.tier) >= public.fan_tier_rank(t));
    pts := nullif(pol.rules #>> array['actions', 'tier_bonus', 'pointsByTier', t], '')::integer;
    continue when pts is null or pts <= 0;
    gid := null;
    insert into public.fan_tier_bonus_grants (app_user_id, celebrity_id, passport_id, tier, tier_history_id, status, policy_version, points, void_reason)
    values (p_user, p_celebrity, pass.id, t, hid, case when payable then 'pending' else 'void' end, pol.version, pts,
      case when payable then null else 'account_inactive' end)
    on conflict (app_user_id, celebrity_id, tier) do nothing returning id into gid;
    if gid is not null and payable then
      begin perform public.pay_fan_tier_bonus_grant(gid);
      exception when others then
        update public.fan_tier_bonus_grants set attempts = attempts + 1, last_error = left(sqlerrm, 200), next_retry_at = clock_timestamp() + interval '5 minutes'
         where id = gid and status = 'pending';
      end;
    end if;
  end loop;
  return hid;
end $$;

create function public.zzz_fan_tier_sync_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare u uuid; c uuid;
begin
  if tg_table_name = 'passport_page_slots' then
    select p.app_user_id, p.celebrity_id into u, c from public.fan_passports p where p.id = new.passport_id;
  else
    u := new.app_user_id; c := new.celebrity_id;
  end if;
  perform public.dukjil_sync_fan_tier(u, c, true);
  return null;
end $$;
create function public.zzz_fan_tier_start_row() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.dukjil_sync_fan_tier(new.app_user_id, new.celebrity_id, false);
  return null;
end $$;
create trigger zzz_fan_tier_sync after insert on public.creator_heart_ledger for each row execute function public.zzz_fan_tier_sync_row();
create trigger zzz_fan_tier_sync after insert on public.fan_heart_conversions for each row execute function public.zzz_fan_tier_sync_row();
create trigger zzz_fan_tier_sync after update of stamp_id on public.passport_page_slots
  for each row when (old.stamp_id is distinct from new.stamp_id) execute function public.zzz_fan_tier_sync_row();
create trigger zzz_fan_tier_sync_insert after insert on public.passport_page_slots
  for each row when (new.stamp_id is not null) execute function public.zzz_fan_tier_sync_row();
create trigger zzz_fan_tier_start after insert on public.fan_passports for each row execute function public.zzz_fan_tier_start_row();

-- Retries pending grants (oldest due first). Wallet keys first, then the grant row, the same order as the writing path.
create function public.retry_fan_tier_bonus_grants(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g record; res text; paid integer := 0; voided integer := 0; pending integer := 0;
begin
  for g in select id, app_user_id from public.fan_tier_bonus_grants
            where status = 'pending' and (next_retry_at is null or next_retry_at <= clock_timestamp())
            order by next_retry_at nulls first, created_at limit least(greatest(coalesce(p_limit, 50), 1), 200) loop
    perform public.dukjil_tier_lock(g.app_user_id);
    if not public.dukjil_b3_payable(g.app_user_id) then
      update public.fan_tier_bonus_grants set status = 'void', void_reason = 'account_inactive' where id = g.id and status = 'pending';
      voided := voided + 1; continue;
    end if;
    res := public.pay_fan_tier_bonus_grant(g.id);
    if res = 'paid' then paid := paid + 1; elsif res = 'void' then voided := voided + 1; else pending := pending + 1; end if;
  end loop;
  return jsonb_build_object('paid', paid, 'void', voided, 'pending', pending);
end $$;
select cron.schedule('fan-tier-bonus-retry', '*/5 * * * *', $c$select public.retry_fan_tier_bonus_grants(50)$c$);

-- Install: every passport's history matches its current tier now (no bonus: all of it is before the bonus starts). A function so the
-- same step can run outside a migration if a production run turns out long (it must finish before v2 takes effect).
create function public.dukjil_tier_history_catch_up() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p record; v_tier text; v_last public.fan_tier_history%rowtype; v_now timestamptz; n_start integer := 0; n_fix integer := 0;
begin
  if (select policy_version from public.reward_policy_activation where singleton) is null then return jsonb_build_object('start', 0, 'correction', 0); end if;
  for p in select fp.id, fp.app_user_id, fp.celebrity_id, fp.issued_at from public.fan_passports fp order by fp.app_user_id, fp.id loop
    perform public.dukjil_tier_lock(p.app_user_id);
    v_tier := public.get_fan_effective_tier(p.app_user_id, p.celebrity_id);
    continue when public.fan_tier_rank(v_tier) is null;
    v_now := public.dukjil_now();
    select * into v_last from public.fan_tier_history h where h.passport_id = p.id order by h.occurred_at desc, h.id desc limit 1;
    if v_last.id is null then
      insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
      values (p.app_user_id, p.celebrity_id, p.id, 'start', null, 'Bronze', p.issued_at, v_now);
      if v_tier <> 'Bronze' then
        insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
        values (p.app_user_id, p.celebrity_id, p.id, 'baseline', 'Bronze', v_tier, greatest(v_now, p.issued_at), v_now);
      end if;
      n_start := n_start + 1;
    elsif v_last.tier <> v_tier then
      insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
      values (p.app_user_id, p.celebrity_id, p.id, 'correction', v_last.tier, v_tier, greatest(v_now, v_last.occurred_at), v_now);
      n_fix := n_fix + 1;
    end if;
  end loop;
  return jsonb_build_object('start', n_start, 'correction', n_fix);
end $$;
select public.dukjil_tier_history_catch_up();

-- observe_fan_tiers: a change with bonus grants carries bonusPoints (paid grants of that row; 0 while pending).
insert into public.b3_function_patch_bases (fn, base_md5) values
  ('public.observe_fan_tiers(uuid,public.content_locale)', '9f9a45e02c03d99fc996cf8985438981');
insert into public.b3_function_patches (fn, pair_no, original, patched) values
('public.observe_fan_tiers(uuid,public.content_locale)', 1,
$o$      'previousTier', h.previous_tier, 'tier', h.tier, 'occurredAt', h.occurred_at) order by h.occurred_at, h.id)$o$,
$p$      'previousTier', h.previous_tier, 'tier', h.tier, 'occurredAt', h.occurred_at)
      || case when exists (select 1 from public.fan_tier_bonus_grants g where g.tier_history_id = h.id) /* b3-bonus */
           then jsonb_build_object('bonusPoints', (select coalesce(sum(g.points), 0) from public.fan_tier_bonus_grants g
             where g.tier_history_id = h.id and g.status = 'paid')) else '{}'::jsonb end order by h.occurred_at, h.id)$p$);
do $$ begin perform public.b3_patch_function('public.observe_fan_tiers(uuid,public.content_locale)', false); end $$;

revoke all on function public.fan_tier_bonus_grants_guard(), public.dukjil_tier_lock(uuid), public.pay_fan_tier_bonus_grant(uuid),
  public.dukjil_sync_fan_tier(uuid, uuid, boolean), public.zzz_fan_tier_sync_row(), public.zzz_fan_tier_start_row(),
  public.retry_fan_tier_bonus_grants(integer), public.dukjil_tier_history_catch_up() from public, anon, authenticated, service_role;

-- owner-policy-begin (same remedy as 20261215060000)
do $$
declare me record; t record;
begin
  select oid, rolname, rolsuper, rolbypassrls into me from pg_roles where rolname = current_user;
  if me.rolsuper or me.rolbypassrls then return; end if;
  for t in select * from (values ('reward_policy_activation','select'),('fan_passports','select'),('fan_tier_history','select, insert'),
      ('dukjil_policy_versions','select'),('app_users','select'),('app_user_moderation_restrictions','select')) v(tname, privs) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or not pg_has_role(me.oid, c.relowner, 'USAGE')))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and me.oid = any(pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
-- owner-policy-end

do $$ declare pair record; caller_owner name; target_owner name; begin
  for pair in select * from (values
    ('public.dukjil_sync_fan_tier(uuid,uuid,boolean)', 'public.get_fan_effective_tier(uuid,uuid)'),
    ('public.dukjil_sync_fan_tier(uuid,uuid,boolean)', 'public.dukjil_b3_payable(uuid)'),
    ('public.dukjil_sync_fan_tier(uuid,uuid,boolean)', 'public.dukjil_now()'),
    ('public.pay_fan_tier_bonus_grant(uuid)', 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'),
    ('public.retry_fan_tier_bonus_grants(integer)', 'public.dukjil_b3_payable(uuid)'),
    ('public.dukjil_tier_history_catch_up()', 'public.get_fan_effective_tier(uuid,uuid)'),
    ('public.dukjil_tier_history_catch_up()', 'public.dukjil_now()')) v(caller, target) loop
    select pg_get_userbyid(proowner) into caller_owner from pg_proc where oid = pair.caller::regprocedure;
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = pair.target::regprocedure;
    if caller_owner in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner % for %', caller_owner, pair.caller; end if;
    if caller_owner <> target_owner then execute format('grant execute on function %s to %I', pair.target, caller_owner); end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

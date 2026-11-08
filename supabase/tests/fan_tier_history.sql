-- Local disposable-database contract test for 20261215060000_fan_tier_history. Every change rolls back.
-- Uses an existing passport whose holder has one other passport or none; run after seeding the local stack.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fp record; other uuid; r jsonb; items jsonb; first_count integer; change jsonb;
begin
  if has_table_privilege('anon', 'public.fan_tier_history', 'SELECT') or has_table_privilege('authenticated', 'public.fan_tier_history', 'SELECT')
   or has_table_privilege('service_role', 'public.fan_tier_history', 'SELECT')
   or has_function_privilege('anon', 'public.observe_fan_tiers(uuid,public.content_locale)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.read_fan_tier_history(uuid,uuid)', 'EXECUTE')
   or not has_function_privilege('service_role', 'public.observe_fan_tiers(uuid,public.content_locale)', 'EXECUTE') then
    raise exception 'Tier history exposed or not callable by the server';
  end if;

  -- A Bronze passport (the summary's expression says Bronze).
  select p.id, p.app_user_id, p.celebrity_id, p.issued_at into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
   where public.get_fan_effective_tier_for_score(p.app_user_id, p.celebrity_id, coalesce((select sum(points)::integer from public.fan_score_ledger x where x.app_user_id = p.app_user_id and x.celebrity_id = p.celebrity_id), 0),
     (select policy_version from public.reward_policy_activation where singleton)) = 'Bronze'
   order by p.issued_at desc limit 1;
  if fp.id is null then raise exception 'Fixture: no Bronze passport'; end if;
  delete from public.fan_tier_history where app_user_id = fp.app_user_id;

  -- First look: a seen start row per passport, nothing to celebrate.
  r := public.observe_fan_tiers(fp.app_user_id, 'ko');
  if jsonb_array_length(r->'changes') <> 0 then raise exception 'First observation celebrated: %', r; end if;
  items := public.read_fan_tier_history(fp.app_user_id, fp.id)->'items';
  if jsonb_array_length(items) <> 1 or items->0->>'kind' <> 'start' or items->0->>'tier' <> 'Bronze' or (items->0->>'occurredAt')::timestamptz <> fp.issued_at then
    raise exception 'Start row wrong: %', items;
  end if;
  select count(*) into first_count from public.fan_tier_history where app_user_id = fp.app_user_id;

  -- Unchanged: nothing written.
  perform public.observe_fan_tiers(fp.app_user_id, 'ko');
  if (select count(*) from public.fan_tier_history where app_user_id = fp.app_user_id) <> first_count then raise exception 'Unchanged tier wrote a row'; end if;

  -- A drop: the last row says Silver while the badge says Bronze, so a seen 'down' row is added and nothing is celebrated.
  update public.fan_tier_history set tier = 'Silver', kind = 'baseline', previous_tier = 'Bronze' where passport_id = fp.id;
  r := public.observe_fan_tiers(fp.app_user_id, 'ko');
  items := public.read_fan_tier_history(fp.app_user_id, fp.id)->'items';
  if items->0->>'kind' <> 'down' or items->0->>'previousTier' <> 'Silver' or items->0->>'tier' <> 'Bronze' or jsonb_array_length(r->'changes') <> 0 then
    raise exception 'Drop not recorded as a seen down row: % / %', items, r;
  end if;

  -- A rise: a passport above Bronze whose last row says one tier lower gets one unseen 'up' row, returned with slug and name.
  select p.id, p.app_user_id, p.celebrity_id, public.get_fan_effective_tier_for_score(p.app_user_id, p.celebrity_id, coalesce((select sum(points)::integer from public.fan_score_ledger x where x.app_user_id = p.app_user_id and x.celebrity_id = p.celebrity_id), 0),
     (select policy_version from public.reward_policy_activation where singleton)) tier into fp
   from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
   where public.get_fan_effective_tier_for_score(p.app_user_id, p.celebrity_id, coalesce((select sum(points)::integer from public.fan_score_ledger x where x.app_user_id = p.app_user_id and x.celebrity_id = p.celebrity_id), 0),
     (select policy_version from public.reward_policy_activation where singleton)) <> 'Bronze' limit 1;
  if fp.id is null then raise exception 'Fixture: no passport above Bronze'; end if;
  delete from public.fan_tier_history where app_user_id = fp.app_user_id;
  r := public.observe_fan_tiers(fp.app_user_id, 'ko');
  items := public.read_fan_tier_history(fp.app_user_id, fp.id)->'items';
  if jsonb_array_length(r->'changes') <> 0 or items->0->>'kind' <> 'baseline' or items->0->>'tier' <> fp.tier or items->1->>'kind' <> 'start' then
    raise exception 'A passport already above Bronze must get start + baseline and no celebration: % / %', items, r;
  end if;
  update public.fan_tier_history set tier = 'Bronze', previous_tier = 'Bronze', kind = 'baseline' where passport_id = fp.id and kind = 'baseline';
  r := public.observe_fan_tiers(fp.app_user_id, 'ko');
  change := r->'changes'->0;
  if jsonb_array_length(r->'changes') <> 1 or change->>'passportId' <> fp.id::text or change->>'previousTier' <> 'Bronze' or change->>'tier' <> fp.tier
     or coalesce(change->>'slug', '') = '' or coalesce(change->>'name', '') = '' then
    raise exception 'Rise payload wrong: %', r;
  end if;
  -- Asked again before it is marked: the same single rise, no second row.
  if jsonb_array_length(public.observe_fan_tiers(fp.app_user_id, 'ko')->'changes') <> 1 then raise exception 'Rise duplicated'; end if;

  -- Another user cannot mark it, the owner can, once; then nothing is left to celebrate.
  select id into other from public.app_users where id <> fp.app_user_id limit 1;
  if public.mark_fan_tier_changes_seen(other, array[(change->>'id')::uuid]) <> 0 then raise exception 'Another user marked the rise'; end if;
  if public.mark_fan_tier_changes_seen(fp.app_user_id, array[(change->>'id')::uuid]) <> 1 then raise exception 'Owner could not mark the rise'; end if;
  if public.mark_fan_tier_changes_seen(fp.app_user_id, array[(change->>'id')::uuid]) <> 0 then raise exception 'Marked twice'; end if;
  if jsonb_array_length(public.observe_fan_tiers(fp.app_user_id, 'ko')->'changes') <> 0 then raise exception 'Celebrated after seen'; end if;
  if public.read_fan_tier_history(other, fp.id) is not null then raise exception 'Another user read the history'; end if;

  -- A rise that a later drop undid is not celebrated.
  insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at)
   values (fp.app_user_id, fp.celebrity_id, fp.id, 'up', fp.tier, 'Diamond', clock_timestamp());
  if fp.tier <> 'Diamond' then
    r := public.observe_fan_tiers(fp.app_user_id, 'ko');
    if jsonb_array_length(r->'changes') <> 0 then raise exception 'An undone rise was celebrated: %', r; end if;
  end if;
  raise notice 'fan_tier_history contract ok (passport %)', fp.id;
end $$;

rollback;

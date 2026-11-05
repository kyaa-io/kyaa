-- PASSPORT-RENEWAL P2 (6/8): room entry by stage (contract.md section 3.8). Before Tier policy v3 is active every result is the same as
-- before (Tier rank only). Once v3 is active a room needs the passport stage >= the room minimum, and from gold-1 up also an active jjinfan title.
-- minimum_stage_key is the precise minimum; minimum_tier stays for old callers. group_room_allowed(...) keeps its signature and callers: it reads
-- the Tier passed by callers (stage <tier>-1), so a silver-2 room is exact only through group_room_entry (reported limit; callers not patched).

alter table public.group_rooms add column minimum_stage_key text
  check (minimum_stage_key is null or minimum_stage_key in ('bronze-1','silver-1','silver-2','gold-1','gold-2','gold-3','platinum-1','platinum-2','platinum-3','platinum-4','diamond-1'));

-- 'Member' (membership only) joins the Tier values.
do $migration$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.group_rooms'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%minimum_tier%Bronze%Diamond%'
              and pg_get_constraintdef(oid) not like '%default_key%'
  loop
    execute format('alter table public.group_rooms drop constraint %I', c.conname);
  end loop;
end $migration$;
alter table public.group_rooms add constraint group_rooms_minimum_tier_check
  check (minimum_tier is null or minimum_tier in ('Member','Bronze','Silver','Gold','Platinum','Diamond'));

update public.group_rooms set minimum_stage_key = lower(minimum_tier) || '-1' where minimum_tier in ('Bronze','Silver','Gold','Platinum','Diamond') and minimum_stage_key is null;
alter table public.group_rooms alter column minimum_stage_key set default 'gold-1';
alter table public.group_rooms add constraint group_rooms_stage_follows_tier_check
  check (minimum_tier is null or minimum_tier = 'Member' or minimum_stage_key is not null);

-- Stage rank of a stage key or Tier name in policy v3 (a Tier name means its first stage).
create function public.passport_stage_rank(p_key text) returns smallint
language sql stable security definer set search_path = '' as $$
  select stage_rank from public.reward_policy_tier_stages
   where policy_version = 3 and (stage_key = lower(p_key) or (subdivision = 1 and tier_name = p_key))
   order by stage_rank limit 1
$$;

create function public.group_room_gate(p_actor uuid, p_page uuid, p_minimum text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare g public.group_pages; pol integer; need smallint; have smallint;
begin
  select * into g from public.group_pages where id = p_page;
  if not found or not exists(select 1 from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
       where m.page_id = p_page and m.app_user_id = p_actor and public.group_scope_visible(p_actor, g.id)) then return 'not_member'; end if;
  if g.kind <> 'fan' or p_minimum is null or p_minimum = 'Member'
     or exists(select 1 from public.group_artist_bindings b where b.page_id = g.id and b.app_user_id = p_actor) then return 'ok'; end if;
  select policy_version into pol from public.reward_policy_activation where singleton = true;
  if not exists(select 1 from public.fan_passports p where p.app_user_id = p_actor and p.celebrity_id = g.celebrity_id and p.business_status = 'issued') then
    return 'stage_low'; end if;
  if coalesce(pol, 2) < 3 then
    return case when public.fan_level_rank(public.get_fan_effective_tier(p_actor, g.celebrity_id)) >= public.fan_level_rank(split_part(initcap(p_minimum), '-', 1))
      then 'ok' else 'stage_low' end;
  end if;
  need := public.passport_stage_rank(p_minimum);
  have := public.passport_stage_rank(public.get_fan_passport_stage(p_actor, g.celebrity_id) ->> 'stageKey');
  if need is null or have is null or have < need then return 'stage_low'; end if;
  if need >= 4 and not exists(select 1 from public.jjinfan_titles t where t.app_user_id = p_actor and t.celebrity_id = g.celebrity_id and t.revoked_at is null)
    then return 'jjinfan_required'; end if;
  return 'ok';
end $$;

create or replace function public.group_room_allowed(p_actor uuid, p_page uuid, p_minimum text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.group_room_gate(p_actor, p_page, p_minimum) = 'ok'
$$;

create function public.group_room_entry(p_actor uuid, p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.group_rooms; reason text;
begin
  select * into r from public.group_rooms where id = p_room;
  if not found then raise exception 'GROUPS_NOT_FOUND'; end if;
  reason := public.group_room_gate(p_actor, r.page_id, coalesce(r.minimum_stage_key, r.minimum_tier));
  return jsonb_build_object('canEnter', reason = 'ok', 'reason', reason, 'minimumStageKey', r.minimum_stage_key, 'minimumTier', r.minimum_tier);
end $$;

revoke all on function public.passport_stage_rank(text), public.group_room_gate(uuid, uuid, text), public.group_room_entry(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.group_room_entry(uuid, uuid) to service_role;

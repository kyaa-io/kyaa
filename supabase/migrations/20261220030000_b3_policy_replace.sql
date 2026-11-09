-- B3 §6: a dukjil policy can be replaced by the next version at a later KST midnight.
--
-- Until now one row could be active at a time (dukjil_policy_one_active) and activate_dukjil_policy refused when one was, so the only
-- way to change a value was a hand procedure that is not in the repository. After this file:
--   * two active rows may exist as long as their effective_from differ (unique per effective_from among active rows);
--   * dukjil_active_policy(p_at) answers the active row with the latest effective_from not after p_at, so the old row keeps answering
--     until the new one's midnight and the new one answers from that instant on (no gap, no overlap);
--   * passport_policy_row() answers the same row as dukjil_active_policy(now), else the newest draft as before;
--   * replace_dukjil_policy(version, effective_from) turns a higher-version draft active from a KST midnight (at the earliest the
--     next one, and later than every active row's effective_from), under the same advisory lock as activate_dukjil_policy;
--   * retire_superseded_dukjil_policies() marks active rows that a later effective row has replaced as retired (optional bookkeeping:
--     the selection is the same with or without it).
-- activate_dukjil_policy is unchanged (first activation only). Every other reader goes through dukjil_active_policy() or
-- passport_policy_row(), or only asks whether a non-draft row exists (group earnings, mission settle), so none needs a change.
-- Nothing is activated here.
-- It also adds the patch bookkeeping (b3_function_patches, b3_patch_function) the later B3 files use to change existing functions.
--
-- Rollback: supabase/rollback/20261220030000_b3_policy_replace.sql (stops when two rows are active).
begin;
set local lock_timeout = '5s';

drop index public.dukjil_policy_one_active;
create unique index dukjil_policy_active_effective on public.dukjil_policy_versions (effective_from) where status = 'active';

create or replace function public.dukjil_active_policy(p_at timestamptz default pg_catalog.clock_timestamp())
returns public.dukjil_policy_versions language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions where status = 'active' and effective_from <= p_at
   order by effective_from desc limit 1
$$;

create or replace function public.passport_policy_row() returns public.dukjil_policy_versions
language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions
   order by (status = 'active' and effective_from <= pg_catalog.clock_timestamp()) desc,
     case when status = 'active' and effective_from <= pg_catalog.clock_timestamp() then effective_from end desc nulls last,
     version desc limit 1
$$;

-- Replaces the policy in effect by draft p_version from a KST midnight (default: the next one). The current row stays active and keeps
-- answering until then.
create function public.replace_dukjil_policy(p_version integer, p_effective_from timestamptz default null)
returns public.dukjil_policy_versions language plpgsql security definer set search_path = '' as $$
declare
  next_midnight timestamptz := ((public.dukjil_kst_date() + 1)::timestamp at time zone 'Asia/Seoul');
  target timestamptz;
  latest timestamptz;
  row public.dukjil_policy_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dukjil:policy-activation', 0));
  target := coalesce(p_effective_from, next_midnight);
  if target < next_midnight or (target at time zone 'Asia/Seoul')::time <> time '00:00' then
    raise exception 'DUKJIL_EFFECTIVE_FROM_INVALID' using errcode = 'P0001';
  end if;
  select * into row from public.dukjil_policy_versions where version = p_version for update;
  if not found or row.status <> 'draft' then raise exception 'DUKJIL_POLICY_NOT_DRAFT' using errcode = 'P0001'; end if;
  select max(effective_from) into latest from public.dukjil_policy_versions where status = 'active';
  if latest is null then raise exception 'DUKJIL_POLICY_INACTIVE' using errcode = 'P0001'; end if;
  if target <= latest then raise exception 'DUKJIL_EFFECTIVE_FROM_INVALID' using errcode = 'P0001'; end if;
  if p_version <= (select max(version) from public.dukjil_policy_versions where status = 'active') then
    raise exception 'DUKJIL_POLICY_NOT_NEXT' using errcode = 'P0001';
  end if;
  update public.dukjil_policy_versions set status = 'active', effective_from = target
    where version = p_version returning * into row;
  return row;
end $$;

-- Active rows that a later row has taken over (its effective_from is reached) become retired. Returns how many.
create function public.retire_superseded_dukjil_policies() returns integer
language plpgsql security definer set search_path = '' as $$
declare current_version integer; n integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dukjil:policy-activation', 0));
  select version into current_version from public.dukjil_active_policy(pg_catalog.clock_timestamp());
  if current_version is null then return 0; end if;
  update public.dukjil_policy_versions set status = 'retired'
   where status = 'active' and effective_from < (select effective_from from public.dukjil_policy_versions where version = current_version);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.replace_dukjil_policy(integer, timestamptz), public.retire_superseded_dukjil_policies()
  from public, anon, authenticated, service_role;

-- B3 §4.1: the string patches this task makes to existing functions. Each patch is a list of (original, patched) text pairs kept here,
-- so the rollback restores exactly what was replaced and a test can check the state. b3_patch_function(fn, rollback) reads the
-- current definition and applies or reverts every pair of fn in one execute:
--   all pairs (original 1, patched 0) -> apply; all (original 0, patched 1) -> already applied, nothing to do; anything else
--   raises B3_PATCH_PARTIAL <pair>. Applying also requires md5(prosrc) to equal the recorded base (the definition the pairs were
--   taken from), and reverting must give that md5 back. Owner, security, settings and grants are compared before and after.
-- p_target lets a test run the pairs of fn against a renamed copy.
create table public.b3_function_patches (
  fn text not null,
  pair_no integer not null check (pair_no > 0),
  original text not null check (length(original) > 0),
  patched text not null check (length(patched) > 0 and position('/* b3-' in patched) > 0),
  primary key (fn, pair_no)
);
create table public.b3_function_patch_bases (
  fn text primary key,
  base_md5 text not null check (base_md5 ~ '^[0-9a-f]{32}$')
);
alter table public.b3_function_patches enable row level security;
alter table public.b3_function_patches force row level security;
alter table public.b3_function_patch_bases enable row level security;
alter table public.b3_function_patch_bases force row level security;
revoke all on public.b3_function_patches, public.b3_function_patch_bases from public, anon, authenticated, service_role;
do $$ declare owner_role record; begin
  select rolname, rolsuper, rolbypassrls into owner_role from pg_roles where rolname = current_user;
  if not owner_role.rolsuper and not owner_role.rolbypassrls then
    execute format('create policy b3_function_patches_owner on public.b3_function_patches for all to %I using (true) with check (true)', owner_role.rolname);
    execute format('create policy b3_function_patch_bases_owner on public.b3_function_patch_bases for all to %I using (true) with check (true)', owner_role.rolname);
  end if;
end $$;

create function public.b3_patch_count(p_text text, p_part text) returns integer language sql immutable set search_path = '' as $$
  select ((pg_catalog.length(p_text) - pg_catalog.length(pg_catalog.replace(p_text, p_part, ''))) / pg_catalog.length(p_part))::integer
$$;

-- Returns 'applied', 'reverted' or 'unchanged'.
create function public.b3_patch_function(p_fn text, p_rollback boolean, p_target regprocedure default null)
returns text language plpgsql set search_path = '' as $$
declare
  target regprocedure := coalesce(p_target, p_fn::regprocedure);
  def text := pg_catalog.pg_get_functiondef(target);
  base text := (select base_md5 from public.b3_function_patch_bases where fn = p_fn);
  pr record; o integer; w integer; clean boolean := true; done boolean := true; n integer := 0;
  before_meta text; after_meta text;
begin
  if base is null then raise exception 'B3_PATCH_UNKNOWN %', p_fn; end if;
  for pr in select * from public.b3_function_patches where fn = p_fn order by pair_no loop
    n := n + 1;
    o := public.b3_patch_count(def, pr.original); w := public.b3_patch_count(def, pr.patched);
    if not (o = 1 and w = 0) then clean := false; end if;
    if not (o = 0 and w = 1) then done := false; end if;
    if not (o = 1 and w = 0) and not (o = 0 and w = 1) then raise exception 'B3_PATCH_PARTIAL % pair % (original %, patched %)', p_fn, pr.pair_no, o, w; end if;
  end loop;
  if n = 0 then raise exception 'B3_PATCH_UNKNOWN %', p_fn; end if;
  if not clean and not done then raise exception 'B3_PATCH_PARTIAL % (mixed pairs)', p_fn; end if;
  if (not p_rollback and done) or (p_rollback and clean) then return 'unchanged'; end if;
  if not p_rollback and pg_catalog.md5((select prosrc from pg_catalog.pg_proc where oid = target)) <> base then
    raise exception 'B3_PATCH_BASE_CHANGED %: the definition is not the one the pairs were taken from', p_fn;
  end if;
  select pg_catalog.concat_ws('|', p.proowner, p.prosecdef, p.proconfig::text, p.proacl::text, p.provolatile) into before_meta
    from pg_catalog.pg_proc p where p.oid = target;
  for pr in select * from public.b3_function_patches where fn = p_fn order by pair_no loop
    if p_rollback then def := pg_catalog.replace(def, pr.patched, pr.original);
    else def := pg_catalog.replace(def, pr.original, pr.patched); end if;
  end loop;
  execute def;
  def := pg_catalog.pg_get_functiondef(target);
  for pr in select * from public.b3_function_patches where fn = p_fn order by pair_no loop
    o := public.b3_patch_count(def, pr.original); w := public.b3_patch_count(def, pr.patched);
    if (p_rollback and not (o = 1 and w = 0)) or (not p_rollback and not (o = 0 and w = 1)) then
      raise exception 'B3_PATCH_PARTIAL % pair % after execute (original %, patched %)', p_fn, pr.pair_no, o, w;
    end if;
  end loop;
  if p_rollback and pg_catalog.md5((select prosrc from pg_catalog.pg_proc where oid = target)) <> base then
    raise exception 'B3_PATCH_BASE_CHANGED %: the reverted definition differs from the base', p_fn;
  end if;
  select pg_catalog.concat_ws('|', p.proowner, p.prosecdef, p.proconfig::text, p.proacl::text, p.provolatile) into after_meta
    from pg_catalog.pg_proc p where p.oid = target;
  if after_meta is distinct from before_meta then raise exception 'B3_PATCH_META_CHANGED %', p_fn; end if;
  return case when p_rollback then 'reverted' else 'applied' end;
end $$;
revoke all on function public.b3_patch_count(text, text), public.b3_patch_function(text, boolean, regprocedure)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Rollback of 20261220030000_b3_policy_replace.sql: one active policy at a time again. Stops when two rows are active (a replacement was
-- scheduled or took effect); retire the old row first (retire_superseded_dukjil_policies after the new midnight) or leave it.
begin;
set local lock_timeout = '5s';

do $$ begin
  if (select count(*) from public.dukjil_policy_versions where status = 'active') > 1 then
    raise exception 'B3_ROLLBACK_BLOCKED: more than one active dukjil policy';
  end if;
end $$;

do $$ begin
  if exists (select 1 from public.b3_function_patches) then raise exception 'B3_ROLLBACK_BLOCKED: later B3 patches are still recorded'; end if;
end $$;
drop function public.b3_owner_access(text, text[]);
drop function public.b3_owner_execute(text, text[]);
drop function public.b3_patch_function(text, boolean, regprocedure);
drop function public.b3_patch_count(text, text);
drop table public.b3_function_patches, public.b3_function_patch_bases;
drop function public.replace_dukjil_policy(integer, timestamptz);
drop function public.retire_superseded_dukjil_policies();
drop index public.dukjil_policy_active_effective;
create unique index dukjil_policy_one_active on public.dukjil_policy_versions((status)) where status = 'active';

create or replace function public.dukjil_active_policy(p_at timestamptz default pg_catalog.clock_timestamp())
returns public.dukjil_policy_versions language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions where status = 'active' and effective_from <= p_at
$$;

create or replace function public.passport_policy_row() returns public.dukjil_policy_versions
language sql stable security definer set search_path = '' as $$
  select * from public.dukjil_policy_versions
   order by (status = 'active' and effective_from <= pg_catalog.clock_timestamp()) desc, version desc limit 1
$$;

notify pgrst, 'reload schema';
commit;

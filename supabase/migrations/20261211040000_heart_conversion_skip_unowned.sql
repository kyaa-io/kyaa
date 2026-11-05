-- Heart conversion skips stamps without a creator. community_stamps.celebrity_id is null for the welcome and invite kinds, but
-- fan_heart_conversions.celebrity_id is not null, so heart_conversion_apply (20261210136000) failed on dev as soon as one such valid stamp existed.
-- A stamp without a creator has nothing to convert into creator hearts: it is left out of the preview and the apply, and the stamp row is left as it is.
-- What happens to those stamps is not decided here. heart_conversion_unowned_summary() only counts them (valid, issued before the cutoff).
-- Signatures, return columns and grants of the two existing functions stay the same (create or replace keeps owner and ACL).

create or replace function public.heart_conversion_dry_run(p_cutoff timestamptz default transaction_timestamp())
returns table (app_user_id uuid, celebrity_id uuid, stamps_counted integer, hearts integer, remainder smallint, already_converted boolean)
language sql stable security definer set search_path = '' as $$
  select s.app_user_id, s.celebrity_id, s.n::integer, (s.n / 9)::integer, (s.n % 9)::smallint,
         exists(select 1 from public.fan_heart_conversions c where c.app_user_id = s.app_user_id and c.celebrity_id = s.celebrity_id)
    from (select cs.app_user_id, cs.celebrity_id, count(*) n from public.community_stamps cs
           where cs.revoked_at is null and cs.issued_at < p_cutoff and cs.celebrity_id is not null group by cs.app_user_id, cs.celebrity_id) s
$$;

create or replace function public.heart_conversion_unowned_summary(p_cutoff timestamptz default transaction_timestamp())
returns table (users integer, stamps integer)
language sql stable security definer set search_path = '' as $$
  select count(distinct cs.app_user_id)::integer, count(*)::integer from public.community_stamps cs
   where cs.revoked_at is null and cs.issued_at < p_cutoff and cs.celebrity_id is null
$$;

create or replace function public.heart_conversion_apply(p_cutoff timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inserted integer; skipped record;
begin
  if p_cutoff is null then raise exception 'HEART_CONVERSION_CUTOFF_REQUIRED'; end if;
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at)
    select d.app_user_id, d.celebrity_id, d.stamps_counted, d.hearts, d.remainder, p_cutoff from public.heart_conversion_dry_run(p_cutoff) d
    on conflict (app_user_id, celebrity_id) do nothing;
  get diagnostics inserted = row_count;
  select * into skipped from public.heart_conversion_unowned_summary(p_cutoff);
  return jsonb_build_object('inserted', inserted, 'totalRows', (select count(*) from public.fan_heart_conversions),
    'totalHearts', coalesce((select sum(hearts) from public.fan_heart_conversions), 0),
    'skippedUnownedUsers', skipped.users, 'skippedUnownedStamps', skipped.stamps);
end $$;

revoke all on function public.heart_conversion_unowned_summary(timestamptz) from public, anon, authenticated, service_role;

-- Owner rights like 20261210137000: every internal owner of a public function can run the new helper that the apply function calls.
do $migration$
declare r record;
begin
  for r in
    select distinct o.oid as role_oid, o.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner
     where p.pronamespace = 'public'::regnamespace and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
  loop
    if not pg_catalog.has_function_privilege(r.role_oid, 'public.heart_conversion_unowned_summary(timestamptz)'::regprocedure, 'EXECUTE') then
      execute pg_catalog.format('grant execute on function public.heart_conversion_unowned_summary(timestamptz) to %I', r.rolname);
    end if;
  end loop;
  if pg_catalog.has_function_privilege('authenticated', 'public.heart_conversion_unowned_summary(timestamptz)'::regprocedure, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.heart_conversion_unowned_summary(timestamptz)'::regprocedure, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.heart_conversion_apply(timestamptz)'::regprocedure, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.heart_conversion_dry_run(timestamptz)'::regprocedure, 'EXECUTE') then
    raise exception 'HEART_CONVERSION_GRANT_EXPOSED' using errcode = 'P0001';
  end if;
end $migration$;

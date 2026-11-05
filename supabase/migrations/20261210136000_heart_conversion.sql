-- PASSPORT-RENEWAL P2 (7/8): one-time stamp -> heart conversion (contract.md section 3.7). Defining the functions changes no data.
-- heart_conversion_dry_run() is read only. heart_conversion_apply(cutoff) writes fan_heart_conversions once per (user, celebrity)
-- (on conflict do nothing, zero-heart rows included, so a rerun changes nothing). hearts = floor(valid stamps / 9); the remainder (stamps % 9)
-- is recorded and not carried over. Valid stamp = not revoked and issued before the cutoff. Run only through scripts/dev/heart-conversion.sql
-- on dev; no production apply is part of P2.

create function public.heart_conversion_dry_run(p_cutoff timestamptz default transaction_timestamp())
returns table (app_user_id uuid, celebrity_id uuid, stamps_counted integer, hearts integer, remainder smallint, already_converted boolean)
language sql stable security definer set search_path = '' as $$
  select s.app_user_id, s.celebrity_id, s.n::integer, (s.n / 9)::integer, (s.n % 9)::smallint,
         exists(select 1 from public.fan_heart_conversions c where c.app_user_id = s.app_user_id and c.celebrity_id = s.celebrity_id)
    from (select cs.app_user_id, cs.celebrity_id, count(*) n from public.community_stamps cs
           where cs.revoked_at is null and cs.issued_at < p_cutoff group by cs.app_user_id, cs.celebrity_id) s
$$;

create function public.heart_conversion_apply(p_cutoff timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  if p_cutoff is null then raise exception 'HEART_CONVERSION_CUTOFF_REQUIRED'; end if;
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at)
    select d.app_user_id, d.celebrity_id, d.stamps_counted, d.hearts, d.remainder, p_cutoff from public.heart_conversion_dry_run(p_cutoff) d
    on conflict (app_user_id, celebrity_id) do nothing;
  get diagnostics inserted = row_count;
  return jsonb_build_object('inserted', inserted, 'totalRows', (select count(*) from public.fan_heart_conversions),
    'totalHearts', coalesce((select sum(hearts) from public.fan_heart_conversions), 0));
end $$;

revoke all on function public.heart_conversion_dry_run(timestamptz), public.heart_conversion_apply(timestamptz) from public, anon, authenticated, service_role;

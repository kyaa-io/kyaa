begin;
-- Older challenge clients share the passport completion count with the gauge.
do $grant$
declare reader_owner name;
begin
  select r.rolname into strict reader_owner
    from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.read_jjinfan_challenge(uuid)'::regprocedure;
  if reader_owner in ('anon', 'authenticated', 'service_role') then
    raise exception 'Unexpected challenge reader owner %', reader_owner;
  end if;
  execute format('grant execute on function public.creator_jjinfan_count(uuid) to %I', reader_owner);
end $grant$;

create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  n := public.creator_jjinfan_count(p_celebrity);
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and c.enabled;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;
commit;

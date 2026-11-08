-- Rollback for 20261215100000_jjinfan_count_reader_grant.sql. Roll the web back first: the new web reads the gauge through read_jjinfan_gauge.
-- read_jjinfan_challenge goes back to the 20261215020000 body (count through creator_jjinfan_count, end date), with the owner problem that file had.
begin;
set local lock_timeout = '5s';
drop function public.read_jjinfan_gauge(uuid);
create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  n := public.creator_jjinfan_count(p_celebrity);
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description, 'endsOn', c.ends_on) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and public.jjinfan_campaign_open(c.enabled, c.ends_on);
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;
commit;
notify pgrst, 'reload schema';

-- Restores the ten-argument list function (no source tags, no sourceTotals). Deploy the previous web version first:
-- it never sends p_campaign. Tag events already stored stay in fan_product_events (append-only) and are simply unread.
begin;
set local lock_timeout = '3s';
drop function if exists public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text);

create function public.list_admin_event_participants(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_event text,
  p_as_of timestamptz, p_after_at timestamptz, p_after_id uuid, p_limit integer,
  p_slug text default null, p_from timestamptz default null, p_to timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_as_of timestamptz; v_windowed boolean; v_total integer; v_rows jsonb; v_n integer; v_next jsonb := null;
begin
  begin
    perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  exception when others then
    raise exception 'EVENT_PARTICIPANTS_FORBIDDEN' using errcode='42501';
  end;
  v_windowed := p_event in ('page-like','passport-issued');
  if p_event is null or p_event not in ('x-mission','signup-raffle','page-like','passport-issued')
     or p_limit is null or p_limit not between 1 and 1000
     or (p_after_at is null) <> (p_after_id is null) or (p_after_at is not null and p_as_of is null)
     or (v_windowed and (p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{0,63}$' or p_from is null or p_to is null or p_from >= p_to))
     or (not v_windowed and (p_slug is not null or p_from is not null or p_to is not null)) then
    raise exception 'EVENT_PARTICIPANTS_INVALID' using errcode='22023';
  end if;
  v_as_of := least(coalesce(p_as_of, clock_timestamp()), clock_timestamp());

  with source as (
    select r.id, r.app_user_id, r.completed_at as ts, 'completed'::text as status
      from public.fan_reactions r
      join public.celebrities c on c.id=r.celebrity_id
      where p_event in ('x-mission','page-like') and r.business_status='completed'
        and c.slug = case when p_event='x-mission' then 'x-mission-1113' else p_slug end
    union all
    select e.id, e.app_user_id, e.entered_at, 'entered'
      from public.signup_raffle_entries e
      where p_event='signup-raffle'
    union all
    select fp.id, fp.app_user_id, fp.issued_at, 'issued'
      from public.fan_passports fp
      join public.celebrities c on c.id=fp.celebrity_id
      where p_event='passport-issued' and fp.business_status='issued' and c.slug=p_slug
  ), snapshot as materialized (
    select s.id, s.ts, s.status, coalesce(up.nickname,'') as nickname, u.created_at as signed_up_at
      from source s
      join public.app_users u on u.id=s.app_user_id and u.status='active'
      left join public.user_profiles up on up.app_user_id=u.id
      where s.ts<=v_as_of and (p_from is null or s.ts>=p_from) and (p_to is null or s.ts<p_to)
  ), page as (
    select * from snapshot
      where p_after_at is null or (ts,id)<(p_after_at,p_after_id)
      order by ts desc,id desc limit p_limit+1
  )
  select (select count(*) from snapshot),
         coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'signedUpAt',p.signed_up_at,
           'participatedAt',p.ts,'status',p.status) order by p.ts desc,p.id desc) from page p),'[]'::jsonb),
         (select count(*) from page)
    into v_total, v_rows, v_n;

  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    v_next := jsonb_build_object('at',v_rows->(p_limit-1)->'participatedAt','id',v_rows->(p_limit-1)->'id');
  end if;
  return jsonb_build_object('asOf',v_as_of,'total',v_total,'rows',v_rows,'next',v_next);
end $$;

revoke all on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz) to service_role;

commit;

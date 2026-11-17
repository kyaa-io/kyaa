-- Admin event participant list: first inbound source of each participant, and totals per source.
-- A fan page link tagged ?utm_source=<telegram|x|kol>&utm_campaign=<event key>&utm_content=<code> leaves one creator_page_view
-- (source fan_event_source.identified) per signed-in member. With p_campaign set, each row gets sourceTag = the member's first
-- such touch for that campaign ({source, content}, or null), and the result gets sourceTotals = participants per (source, content).
-- Rules (same as the X KoL report): the FIRST authenticated touch of the campaign counts, later links never move it; a first touch
-- recorded more than five minutes after the participation (the server's own clock-skew bound) is not credited to it. Tags are
-- read only from the allowed values, never from free text. Members without a tag are the participants minus the totals.
-- Without p_campaign the result is exactly what it was before: no new row key, no sourceTotals. No identity columns are added.
drop function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz);

create function public.list_admin_event_participants(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_event text,
  p_as_of timestamptz, p_after_at timestamptz, p_after_id uuid, p_limit integer,
  p_slug text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_campaign text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_as_of timestamptz; v_windowed boolean; v_total integer; v_rows jsonb; v_n integer; v_next jsonb := null; v_totals jsonb;
  v_result jsonb;
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
     or (not v_windowed and (p_slug is not null or p_from is not null or p_to is not null))
     or (p_campaign is not null and (not v_windowed or p_campaign !~ '^[a-z0-9][a-z0-9-]{0,63}$')) then
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
    select s.id, s.app_user_id, s.ts, s.status, coalesce(up.nickname,'') as nickname, u.created_at as signed_up_at
      from source s
      join public.app_users u on u.id=s.app_user_id and u.status='active'
      left join public.user_profiles up on up.app_user_id=u.id
      where s.ts<=v_as_of and (p_from is null or s.ts>=p_from) and (p_to is null or s.ts<p_to)
  ), first_touch as (
    select distinct on (e.app_user_id) e.app_user_id, e.properties->>'source' as src, e.properties->>'content' as content, e.occurred_at
      from public.fan_product_events e
      where p_campaign is not null and e.event_name='creator_page_view' and e.source='fan_event_source.identified'
        and e.properties->>'campaign'=p_campaign and e.occurred_at<=v_as_of
        and e.properties->>'source' in ('telegram','x','kol') and e.properties->>'content' ~ '^[a-z0-9-]{1,24}$'
        and e.app_user_id in (select app_user_id from snapshot)
      order by e.app_user_id, e.occurred_at, e.created_at, e.id
  ), tagged as (
    select s.id, s.ts, s.status, s.nickname, s.signed_up_at, t.src, t.content
      from snapshot s
      left join first_touch t on t.app_user_id=s.app_user_id and t.occurred_at<=s.ts+interval '5 minutes'
  ), page as (
    select * from tagged
      where p_after_at is null or (ts,id)<(p_after_at,p_after_id)
      order by ts desc,id desc limit p_limit+1
  )
  select (select count(*) from tagged),
         coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'signedUpAt',p.signed_up_at,
           'participatedAt',p.ts,'status',p.status)
           || case when p_campaign is null then '{}'::jsonb
                   else jsonb_build_object('sourceTag',case when p.src is null then null else jsonb_build_object('source',p.src,'content',p.content) end) end
           order by p.ts desc,p.id desc) from page p),'[]'::jsonb),
         (select count(*) from page),
         coalesce((select jsonb_agg(jsonb_build_object('source',g.src,'content',g.content,'count',g.n) order by g.n desc,g.src,g.content)
           from (select src,content,count(*) as n from tagged where src is not null group by src,content) g),'[]'::jsonb)
    into v_total, v_rows, v_n, v_totals;

  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    v_next := jsonb_build_object('at',v_rows->(p_limit-1)->'participatedAt','id',v_rows->(p_limit-1)->'id');
  end if;
  v_result := jsonb_build_object('asOf',v_as_of,'total',v_total,'rows',v_rows,'next',v_next);
  if p_campaign is not null then v_result := v_result || jsonb_build_object('sourceTotals',v_totals); end if;
  return v_result;
end $$;

revoke all on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer,text,timestamptz,timestamptz,text) to service_role;

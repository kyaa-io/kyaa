-- Read-only admin list of event participants (X mission likes, signup raffle entries).
-- Returns nickname and timestamps only; no email, phone, wallet or auth identifiers.
-- The list is read as of one fixed instant (p_as_of, set by the first call) and continued with a
-- (participation time, id) cursor, so a participation added mid-read can never shift, repeat or drop a row.
create function public.list_admin_event_participants(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_event text,
  p_as_of timestamptz, p_after_at timestamptz, p_after_id uuid, p_limit integer
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_as_of timestamptz; v_total integer; v_rows jsonb; v_n integer; v_next jsonb := null;
begin
  begin
    perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  exception when others then
    raise exception 'EVENT_PARTICIPANTS_FORBIDDEN' using errcode='42501';
  end;
  if p_event not in ('x-mission','signup-raffle') or p_limit is null or p_limit not between 1 and 1000
     or (p_after_at is null) <> (p_after_id is null) or (p_after_at is not null and p_as_of is null) then
    raise exception 'EVENT_PARTICIPANTS_INVALID' using errcode='22023';
  end if;
  v_as_of := least(coalesce(p_as_of, clock_timestamp()), clock_timestamp());
  if p_event='x-mission' then
    select count(*) into v_total
      from public.fan_reactions r
      join public.celebrities c on c.id=r.celebrity_id and c.slug='x-mission-1113'
      join public.app_users u on u.id=r.app_user_id and u.status='active'
      where r.business_status='completed' and r.completed_at<=v_as_of;
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'signedUpAt',p.signed_up_at,
        'participatedAt',p.ts,'status','completed') order by p.ts desc,p.id desc),'[]'::jsonb), count(*) into v_rows, v_n from (
      select r.id,coalesce(up.nickname,'') as nickname,u.created_at as signed_up_at,r.completed_at as ts
        from public.fan_reactions r
        join public.celebrities c on c.id=r.celebrity_id and c.slug='x-mission-1113'
        join public.app_users u on u.id=r.app_user_id and u.status='active'
        left join public.user_profiles up on up.app_user_id=u.id
        where r.business_status='completed' and r.completed_at<=v_as_of
          and (p_after_at is null or (r.completed_at,r.id)<(p_after_at,p_after_id))
        order by r.completed_at desc,r.id desc limit p_limit+1
    ) p;
  else
    select count(*) into v_total
      from public.signup_raffle_entries e
      join public.app_users u on u.id=e.app_user_id and u.status='active'
      where e.entered_at<=v_as_of;
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'signedUpAt',p.signed_up_at,
        'participatedAt',p.ts,'status','entered') order by p.ts desc,p.id desc),'[]'::jsonb), count(*) into v_rows, v_n from (
      select e.id,coalesce(up.nickname,'') as nickname,u.created_at as signed_up_at,e.entered_at as ts
        from public.signup_raffle_entries e
        join public.app_users u on u.id=e.app_user_id and u.status='active'
        left join public.user_profiles up on up.app_user_id=u.id
        where e.entered_at<=v_as_of
          and (p_after_at is null or (e.entered_at,e.id)<(p_after_at,p_after_id))
        order by e.entered_at desc,e.id desc limit p_limit+1
    ) p;
  end if;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    v_next := jsonb_build_object('at',v_rows->(p_limit-1)->'participatedAt','id',v_rows->(p_limit-1)->'id');
  end if;
  return jsonb_build_object('asOf',v_as_of,'total',v_total,'rows',v_rows,'next',v_next);
end $$;

revoke all on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_admin_event_participants(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) to service_role;

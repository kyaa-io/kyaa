-- Place suggestions come only from already reviewed, public ByUs schedules.
create function public.fan_web_search_schedule_places(
  p_query text,p_locale public.content_locale,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_query text:=btrim(p_query); v_pattern text;
begin
  if length(v_query) not between 2 and 120 or p_limit not between 1 and 20 then
    raise exception 'FAN_WEB_INVALID_REQUEST' using errcode='22023';
  end if;
  v_pattern:='%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%';
  return jsonb_build_object('places',coalesce((
    select jsonb_agg(jsonb_build_object('name',place.location) order by place.prefix_match desc,place.uses desc,place.location)
    from (
      select s.location,count(*)::integer uses,lower(s.location) like lower(v_query)||'%' prefix_match
      from public.celebrity_schedules s
      join public.celebrities c on c.id=s.celebrity_id and c.status='published' and c.archived_at is null
      join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
      where s.status='published' and btrim(s.location)<>'' and s.location ilike v_pattern escape '\'
      group by s.location order by prefix_match desc,uses desc,s.location limit p_limit
    ) place
  ),'[]'::jsonb));
end $$;

revoke all on function public.fan_web_search_schedule_places(text,public.content_locale,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.fan_web_search_schedule_places(text,public.content_locale,integer)
  to service_role;

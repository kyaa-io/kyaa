begin;

create function public.read_owned_mobile_participation_catalog(
  p_app_user_id uuid,
  p_locale public.content_locale,
  p_phase text,
  p_kind text,
  p_celebrity_slug text,
  p_after timestamptz,
  p_after_id uuid,
  p_after_kind text,
  p_limit integer
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; v_now timestamptz:=statement_timestamp();
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_locale is null or p_phase is null or p_phase not in('ongoing','upcoming','past')
    or p_kind is null or p_kind not in('all','live','event','goods','space')
    or p_limit is null or p_limit not between 1 and 50
    or (p_celebrity_slug is not null and p_celebrity_slug !~'^[a-z0-9]+(?:-[a-z0-9]+)*$')
    or num_nonnulls(p_after,p_after_id,p_after_kind) not in(0,3)
    or (p_after_kind is not null and p_after_kind not in('live','event','goods','space'))
  then raise exception 'MOBILE_PARTICIPATION_INVALID' using errcode='22023'; end if;

  with creators as materialized(
    select c.id,c.slug,c.image_url,l.name
    from public.celebrities c
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.status='published' and c.archived_at is null
      and(p_celebrity_slug is null or c.slug=p_celebrity_slug)
  ), sources as materialized(
    select e.id,'event'::text kind,e.slug,e.celebrity_id,
      case p_locale when'en'then e.title_en else e.title_ko end title,
      case p_locale when'en'then e.summary_en else e.summary_ko end summary,
      e.hero_url,e.starts_at,e.ends_at,
      case when e.state='ended' or v_now>=e.ends_at then'past'
        when v_now<e.starts_at then'upcoming'else'ongoing'end phase,
      e.featured_rank::integer featured_rank
    from public.mobile_participation_events e join creators c on c.id=e.celebrity_id
    where e.state in('published','ended')
    union all
    select l.id,'live',l.slug,l.celebrity_id,t.title,t.summary,
      l.approved_hero_url,l.starts_at,l.ends_at,
      case effective.status when'live'then'ongoing'when'scheduled'then'upcoming'else'past'end,null
    from public.live_events l
    join creators c on c.id=l.celebrity_id
    join public.brands b on b.id=l.brand_id and b.status='published'
    join public.live_event_localizations t on t.live_event_id=l.id and t.locale=p_locale
    cross join lateral(select public.live_effective_status_at(l.id,v_now) status)effective
    where l.publication_status='published'and l.archived_at is null and effective.status<>'cancelled'
    union all
    select s.id,'space',s.slug,s.celebrity_id,
      case p_locale when'en'then s.title_en else s.title_ko end,
      case p_locale when'en'then s.summary_en else s.summary_ko end,
      s.image_url,s.opens_at,s.closes_at,
      case when s.state='closed'or v_now>=s.closes_at then'past'
        when v_now<s.opens_at then'upcoming'else'ongoing'end,null
    from public.mobile_participation_spaces s join creators c on c.id=s.celebrity_id
    where s.state in('published','closed')
    union all
    select (item->>'benefitId')::uuid,'goods',item->>'slug',c.id,
      item->>'title',item->>'summary',item->>'imageUrl',
      (item->>'opensAt')::timestamptz,(item->>'closesAt')::timestamptz,
      case when v_now>=(item->>'closesAt')::timestamptz then'past'
        when v_now<(item->>'opensAt')::timestamptz then'upcoming'else'ongoing'end,null
    from creators c
    cross join lateral jsonb_array_elements(
      public.read_owned_mobile_benefit_catalog(p_app_user_id,c.slug,p_locale)->'items'
    )item
    where exists(select 1 from public.benefits b join public.mobile_benefit_policies policy
      on policy.benefit_id=b.id and policy.enabled and policy.retired_at is null where b.celebrity_id=c.id)
  ), candidates as materialized(
    select s.*,c.slug celebrity_slug,c.name celebrity_name,c.image_url celebrity_image,
      case s.kind when'live'then'/live/'||s.slug
        when'event'then'/events/'||s.id::text
        when'space'then'/spaces/'||s.id::text
        else'/fans/'||c.slug||'/gifts/'||s.id::text end destination
    from sources s join creators c on c.id=s.celebrity_id
  ), projected as materialized(
    select c.*,coalesce(c.featured_rank,banner.sort_order) rank,
      jsonb_build_object('id',c.id,'kind',c.kind,'slug',c.slug,'title',c.title,
        'summary',c.summary,'heroUrl',c.hero_url,'startsAt',c.starts_at,'endsAt',c.ends_at,
        'phase',c.phase,'favorite',jsonb_build_object('slug',c.celebrity_slug,
          'name',c.celebrity_name,'imageUrl',c.celebrity_image)) item
    from candidates c
    left join lateral(
      select min(b.sort_order)sort_order from public.home_banners b
      join public.home_banner_localizations l on l.banner_id=b.id and l.locale=p_locale
      where b.publication_status='published'and l.href=c.destination
    )banner on true
  ), page as materialized(
    select *,row_number()over(order by
      case when p_phase='past'then starts_at end desc,
      case when p_phase<>'past'then starts_at end,
      case when p_phase='past'then id end desc,case when p_phase<>'past'then id end,
      case when p_phase='past'then kind end desc,case when p_phase<>'past'then kind end
    )position from projected
    where phase=p_phase and(p_kind='all'or kind=p_kind)
      and(p_after is null or
        case when p_phase='past'then(starts_at,id,kind)<(p_after,p_after_id,p_after_kind)
          else(starts_at,id,kind)>(p_after,p_after_id,p_after_kind)end)
    order by position
    limit p_limit+1
  ), shown as materialized(select * from page where position<=p_limit)
  select jsonb_build_object('serverNow',v_now,
    'favorites',coalesce((select jsonb_agg(jsonb_build_object('slug',c.slug,'name',l.name,
      'imageUrl',c.image_url)order by l.name,c.id)
      from public.celebrities c join public.celebrity_localizations l
        on l.celebrity_id=c.id and l.locale=p_locale
      where c.status='published'and c.archived_at is null),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(item order by position)from shown),'[]'::jsonb),
    'featured',coalesce((select jsonb_agg(item order by rank,starts_at,id,kind)
      from(select * from projected where rank is not null and phase<>'past'
        order by rank,starts_at,id,kind limit 20)chosen),'[]'::jsonb),
    'nextCursor',case when(select count(*)from page)>p_limit then(
      select jsonb_build_object('at',starts_at,'id',id,'kind',kind)from shown where position=p_limit
    )else null end
  )into result;
  return result;
end $$;

revoke all on function public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer)to service_role;

commit;

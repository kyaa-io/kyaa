create index chemi_exp_character_week_idx on public.chemi_exp_log(character,kst_date,user_id);

create function public.chemi_growth_ranking(p_viewer uuid,p_character text,p_period text)
returns jsonb language sql stable security definer set search_path='' as $$
  with scores as (
    select m.user_id,m.exp_total,
      case when p_period='week' then sum(l.exp) else m.exp_total end score,
      max(l.created_at) reached
    from public.chemi_minis m
    join public.app_users u on u.id=m.user_id and u.status='active'
    join public.chemi_exp_log l on l.user_id=m.user_id and l.character=m.character
    where m.character=p_character and public.social_profile_is_public(m.user_id)
      and not exists (select 1 from public.social_profile_settings privacy
        where privacy.app_user_id=m.user_id and privacy.profile_visible=false)
      and (p_period='all' or (p_period='week' and l.kst_date>=date_trunc('week',now() at time zone 'Asia/Seoul')::date))
    group by m.user_id,m.exp_total
  ), ranked as (
    select *,row_number() over ordering place,lag(score) over ordering - score + 1 gap
    from scores window ordering as (order by score desc,reached,user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'place',r.place,'score',r.score,'total',r.exp_total,'gap',r.gap,
    'mine',coalesce(r.user_id=p_viewer,false),'name',p.nickname,
    'avatar',case when a.source in ('google','upload') and a.object_path is not null then public.public_fan_avatar_url(r.user_id) end
  ) order by r.place),'[]'::jsonb)
  from ranked r left join public.user_profiles p on p.app_user_id=r.user_id
  left join public.app_user_avatars a on a.app_user_id=r.user_id
  where r.place<=3 or r.user_id=p_viewer
$$;
revoke all on function public.chemi_growth_ranking(uuid,text,text) from public;
do $$
begin
  if exists(select from pg_roles where rolname='service_role') then
    grant execute on function public.chemi_growth_ranking(uuid,text,text) to service_role;
  end if;
end $$;

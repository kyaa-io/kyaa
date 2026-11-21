create or replace function public.chemi_match_ranking(p_viewer uuid, p_friend uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ordered as (
    select w.user_id,w.best_play_id,
           rank() over(order by w.best_score desc) as place,
           row_number() over(order by w.best_score desc,w.best_at,w.user_id) as ordinal
    from public.chemi_game_weeks w
    where w.week_start=date_trunc('week',now() at time zone 'Asia/Seoul')::date
      and w.game='match' and w.best_score>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'place',r.place,'nickname',coalesce(up.nickname,''),'character',p.character,
    'score',p.score,'ticks',(p.input_log->>'ticks')::int,'misses',(p.input_log->>'misses')::int,
    'isMe',coalesce(r.user_id=p_viewer,false),'isFriend',coalesce(r.user_id=p_friend,false)
  ) order by r.ordinal),'[]'::jsonb)
  from ordered r join public.chemi_game_plays p on p.id=r.best_play_id
  left join public.user_profiles up on up.app_user_id=r.user_id
  where r.ordinal<=12 or r.user_id=p_viewer or r.user_id=p_friend
$$;

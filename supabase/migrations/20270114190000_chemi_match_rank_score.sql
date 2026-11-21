create or replace function public.chemi_match_ranking(p_viewer uuid, p_friend uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ordered as (
    select w.user_id,w.best_play_id,
           rank() over(order by w.best_score desc) as place,
           row_number() over(order by w.best_score desc,w.best_at,w.user_id) as ordinal
    from public.chemi_game_weeks w
    join public.chemi_game_plays best on best.id=w.best_play_id
    where w.week_start=date_trunc('week',now() at time zone 'Asia/Seoul')::date
      and w.game='match' and w.best_score>0 and best.input_log ? 'stage'
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

-- Keep the reward receipt on the verified play so retrying a finish is idempotent.
alter table public.chemi_game_plays add column match_stage_reward jsonb;

create function public.chemi_match_finish_stages(p_user uuid,p_play uuid,p_score integer,p_log jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  play public.chemi_game_plays;
  receipt jsonb;
  reached int := (p_log->>'stage')::int;
  title text;
  awarded text;
  excitement int;
begin
  select * into play from public.chemi_game_plays
    where id=p_play and user_id=p_user and game='match' for update;
  if not found or reached is null or reached not between 1 and 5 then raise exception 'CHEMI_INVALID'; end if;
  receipt := public.chemi_match_finish(p_user,p_play,p_score,p_log);
  if play.match_stage_reward is not null then return receipt || play.match_stage_reward; end if;
  -- The legacy three-round scale cannot be compared with SNAP points.
  -- Keep the old play intact and switch this week's best on the first positive new score.
  if p_score > 0 then
    update public.chemi_game_weeks w set best_play_id=p_play,best_score=p_score,best_at=clock_timestamp()
      where w.user_id=p_user and w.game='match'
        and w.week_start=date_trunc('week',now() at time zone 'Asia/Seoul')::date
        and exists(select 1 from public.chemi_game_plays old
          where old.id=w.best_play_id and not (old.input_log ? 'stage'));
  end if;
  insert into public.chemi_minis(user_id,character) values(p_user,play.character)
    on conflict do nothing;
  select least(4, greatest(0,100-coalesce((meters->>'excitement')::int,0))) into excitement
    from public.chemi_minis where user_id=p_user and character=play.character for update;
  update public.chemi_minis set meters=jsonb_set(meters,'{excitement}',
    to_jsonb(coalesce((meters->>'excitement')::int,0)+excitement)), meters_at=clock_timestamp()
    where user_id=p_user and character=play.character;
  if reached > 1 then
    title:='match_stage_'||reached;
    insert into public.chemi_titles(user_id,title_code) values(p_user,title)
      on conflict do nothing returning title_code into awarded;
  end if;
  play.match_stage_reward:=jsonb_build_object('excitement',excitement,'titleStage',
    case when awarded is not null then reached end);
  update public.chemi_game_plays set match_stage_reward=play.match_stage_reward where id=p_play;
  return receipt || play.match_stage_reward;
end $$;

create function public.chemi_match_equip(p_user uuid,p_stage int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.app_users where id=p_user for update;
  if not exists(select 1 from public.chemi_titles where user_id=p_user and title_code='match_stage_'||p_stage)
    then raise exception 'CHEMI_INVALID'; end if;
  update public.chemi_titles set equipped=false where user_id=p_user and equipped;
  update public.chemi_titles set equipped=true where user_id=p_user and title_code='match_stage_'||p_stage;
  return true;
end $$;
revoke all on function public.chemi_match_finish_stages(uuid,uuid,integer,jsonb), public.chemi_match_equip(uuid,int)
  from public, anon, authenticated;
grant execute on function public.chemi_match_finish_stages(uuid,uuid,integer,jsonb), public.chemi_match_equip(uuid,int)
  to service_role;

-- 최애 런 점수 체계 변경(거리 m → 점수): 칭호는 4,000·10,000·18,000점,
-- 랭킹에 내 앞뒤 줄, 입구에 오늘 달린 사람 수·이번 주 내 최고·활동 포인트 잔액.
create or replace function public.chemi_run_ranking(p_viewer uuid, p_friend uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ordered as (
    select w.user_id,w.best_play_id,
           row_number() over(order by w.best_score desc,w.best_at,w.user_id) as place
    from public.chemi_game_weeks w
    where w.week_start=date_trunc('week',now() at time zone 'Asia/Seoul')::date
      and w.game='run' and w.best_score>0
  ), mine as (select place from ordered where user_id=p_viewer)
  select coalesce(jsonb_agg(jsonb_build_object(
    'place',r.place,'nickname',coalesce(up.nickname,''),'character',p.character,
    'score',p.score,
    'isMe',coalesce(r.user_id=p_viewer,false),'isFriend',coalesce(r.user_id=p_friend,false)
  ) order by r.place),'[]'::jsonb)
  from ordered r join public.chemi_game_plays p on p.id=r.best_play_id
  left join public.user_profiles up on up.app_user_id=r.user_id
  where r.place<=20 or r.user_id=p_viewer or r.user_id=p_friend
     or r.place between (select place-1 from mine) and (select place+1 from mine)
$$;

create or replace function public.chemi_run_lobby(p_user uuid, p_sound boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sound boolean; free_used integer; extra_used integer; last_week date;
  previous_result jsonb; week_best integer; today_players integer;
begin
  perform public.chemi_lock_user(p_user,false);
  if p_sound is not null then
    insert into public.chemi_user_state(user_id,sound_on) values(p_user,p_sound)
    on conflict(user_id) do update set sound_on=excluded.sound_on;
  end if;
  select sound_on into sound from public.chemi_user_state where user_id=p_user;
  select count(*) filter(where slot_kind='free'),count(*) filter(where slot_kind='extra')
  into free_used,extra_used from public.chemi_game_plays
  where user_id=p_user and game='run' and kst_date=public.dukjil_kst_date() and status<>'refunded';
  select count(distinct user_id) into today_players from public.chemi_game_plays
  where game='run' and kst_date=public.dukjil_kst_date() and status='verified' and user_id is not null;
  select best_score into week_best from public.chemi_game_weeks
  where user_id=p_user and game='run' and week_start=date_trunc('week',now() at time zone 'Asia/Seoul')::date;
  last_week := date_trunc('week',now() at time zone 'Asia/Seoul')::date-7;
  with ranked as (
    select user_id,row_number() over(order by best_score desc,best_at,user_id) as place
    from public.chemi_game_weeks where week_start=last_week and game='run' and best_score>0
  )
  update public.chemi_game_weeks w set run_result_seen_at=clock_timestamp(),status='final',final_rank=r.place
    from ranked r where w.user_id=p_user and w.user_id=r.user_id and w.week_start=last_week
      and w.game='run' and w.run_result_seen_at is null
    returning jsonb_build_object('place',w.final_rank,'score',w.best_score) into previous_result;
  return jsonb_build_object('sound',coalesce(sound,false),'freeRemaining',3-free_used,
    'extraRemaining',3-extra_used,'ranking',public.chemi_run_ranking(p_user),'previous',previous_result,
    'players',today_players,'best',coalesce(week_best,0),
    'points',public.group_wallet_balance(p_user,'fan_point'));
end $$;

create or replace function public.chemi_run_finish(p_user uuid,p_play uuid,p_score integer,p_log jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare play public.chemi_game_plays; finished timestamptz; day_kst date; exp_awarded integer:=0; title_awarded integer;
begin
  perform public.chemi_lock_user(p_user,false);
  select * into play from public.chemi_game_plays where id=p_play and user_id=p_user and game='run' for update;
  if not found then raise exception 'CHEMI_INVALID'; end if;
  if play.status='verified' and play.score=p_score and play.input_log=p_log then
    return jsonb_build_object('score',play.score,'exp',play.run_exp,'shareId',play.run_share_id,'title',play.run_title);
  end if;
  if play.status<>'issued' or p_score is null or p_score<0 then raise exception 'CHEMI_INVALID'; end if;
  finished:=clock_timestamp();
  day_kst:=(finished at time zone 'Asia/Seoul')::date;
  if p_score>0 then
    insert into public.chemi_game_weeks(week_start,game,user_id,best_score,best_play_id,best_at)
    values(date_trunc('week',day_kst::timestamp)::date,'run',p_user,p_score,p_play,finished)
    on conflict(week_start,game,user_id) do update
      set best_score=excluded.best_score,best_play_id=excluded.best_play_id,best_at=excluded.best_at
      where excluded.best_score>chemi_game_weeks.best_score;
    insert into public.chemi_exp_log(user_id,character,source,kst_date,exp) values(p_user,play.character,'run',day_kst,10)
    on conflict do nothing;
    if found then
      exp_awarded:=10;
      insert into public.chemi_minis(user_id,character,exp_total) values(p_user,play.character,10)
      on conflict(user_id,character) do update set exp_total=chemi_minis.exp_total+10;
    end if;
    with awarded as (
      insert into public.chemi_titles(user_id,title_code)
      select p_user,'run_score_'||milestone from unnest(array[4000,10000,18000]) milestone where milestone<=p_score
      on conflict do nothing returning title_code
    ) select max(substr(title_code,11)::int) into title_awarded from awarded;
  end if;
  update public.chemi_game_plays set status='verified',score=p_score,input_log=p_log,submitted_at=finished,
    run_exp=exp_awarded,run_title=title_awarded,run_share_id=replace(gen_random_uuid()::text,'-','') where id=p_play returning * into play;
  return jsonb_build_object('score',play.score,'exp',play.run_exp,'shareId',play.run_share_id,'title',play.run_title);
end $$;

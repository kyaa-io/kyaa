-- Private receipts and unguessable, time-limited invitations. Removing the play removes its invitation.
alter table public.chemi_game_plays
  add column match_share_id text unique,
  add column match_trial_at timestamptz,
  add column match_trial_receipt jsonb,
  add column match_exp smallint not null default 0;
alter table public.chemi_game_weeks add column match_result_seen_at timestamptz;

create function public.chemi_match_info(p_user uuid, p_play uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('playId',id,'game',game,'seed',seed,'issuedAt',issued_at,'status',status)
  from public.chemi_game_plays where user_id=p_user and id=p_play and game='match'
$$;

create function public.chemi_match_leave(p_user uuid, p_play uuid) returns jsonb
language sql security definer set search_path = '' as $$
  with abandoned as (
    update public.chemi_game_plays set status='void'
    where id=p_play and user_id=p_user and game='match' and status='issued' returning id
  ) select jsonb_build_object('left',exists(select from abandoned))
$$;

create function public.chemi_match_ranking(p_viewer uuid, p_friend uuid default null) returns jsonb
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
    'ticks',(p.input_log->>'ticks')::int,'misses',(p.input_log->>'misses')::int,
    'isMe',coalesce(r.user_id=p_viewer,false),'isFriend',coalesce(r.user_id=p_friend,false)
  ) order by r.ordinal),'[]'::jsonb)
  from ordered r join public.chemi_game_plays p on p.id=r.best_play_id
  left join public.user_profiles up on up.app_user_id=r.user_id
  where r.ordinal<=12 or r.user_id=p_viewer or r.user_id=p_friend
$$;

create function public.chemi_match_lobby(p_user uuid, p_sound boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sound boolean; free_used integer; extra_used integer; last_week date;
  previous_result jsonb;
begin
  perform public.chemi_lock_user(p_user,false);
  if p_sound is not null then
    insert into public.chemi_user_state(user_id,sound_on) values(p_user,p_sound)
    on conflict(user_id) do update set sound_on=excluded.sound_on;
  end if;
  select sound_on into sound from public.chemi_user_state where user_id=p_user;
  select count(*) filter(where slot_kind='free'),count(*) filter(where slot_kind='extra')
  into free_used,extra_used from public.chemi_game_plays
  where user_id=p_user and game='match' and kst_date=public.dukjil_kst_date() and status<>'refunded';
  last_week := date_trunc('week',now() at time zone 'Asia/Seoul')::date-7;
  with ranked as (
    select user_id,rank() over(order by best_score desc) as place
    from public.chemi_game_weeks where week_start=last_week and game='match' and best_score>0
  )
  update public.chemi_game_weeks w set match_result_seen_at=clock_timestamp(),status='final',final_rank=r.place
    from ranked r where w.user_id=p_user and w.user_id=r.user_id and w.week_start=last_week
      and w.game='match' and w.match_result_seen_at is null
    returning jsonb_build_object('place',w.final_rank,'score',w.best_score) into previous_result;
  return jsonb_build_object('sound',coalesce(sound,false),'freeRemaining',3-free_used,
    'extraRemaining',3-extra_used,'ranking',public.chemi_match_ranking(p_user),'previous',previous_result);
end $$;

create function public.chemi_match_finish(p_user uuid,p_play uuid,p_score integer,p_log jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare play public.chemi_game_plays; finished timestamptz; day_kst date; exp_awarded integer:=0;
begin
  perform public.chemi_lock_user(p_user,false);
  select * into play from public.chemi_game_plays where id=p_play and user_id=p_user and game='match' for update;
  if not found then raise exception 'CHEMI_INVALID'; end if;
  if play.status='verified' and play.score=p_score and play.input_log=p_log then
    return jsonb_build_object('score',play.score,'exp',play.match_exp,'shareId',play.match_share_id);
  end if;
  if play.status<>'issued' or p_score is null or p_score<0 then raise exception 'CHEMI_INVALID'; end if;
  finished:=clock_timestamp();
  day_kst:=(finished at time zone 'Asia/Seoul')::date;
  if p_score>0 then
    insert into public.chemi_game_weeks(week_start,game,user_id,best_score,best_play_id,best_at)
    values(date_trunc('week',day_kst::timestamp)::date,'match',p_user,p_score,p_play,finished)
    on conflict(week_start,game,user_id) do update
      set best_score=excluded.best_score,best_play_id=excluded.best_play_id,best_at=excluded.best_at
      where excluded.best_score>chemi_game_weeks.best_score;
    insert into public.chemi_exp_log(user_id,character,source,kst_date,exp) values(p_user,play.character,'match',day_kst,10)
    on conflict do nothing;
    if found then
      exp_awarded:=10;
      insert into public.chemi_minis(user_id,character,exp_total) values(p_user,play.character,10)
      on conflict(user_id,character) do update set exp_total=chemi_minis.exp_total+10;
    end if;
    insert into public.chemi_titles(user_id,title_code) values(p_user,'match_first') on conflict do nothing;
  end if;
  update public.chemi_game_plays set status='verified',score=p_score,input_log=p_log,submitted_at=finished,
    match_exp=exp_awarded,match_share_id=replace(gen_random_uuid()::text,'-','') where id=p_play returning * into play;
  return jsonb_build_object('score',play.score,'exp',play.match_exp,'shareId',play.match_share_id);
end $$;

create function public.chemi_match_challenge(p_share text,p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare play public.chemi_game_plays; guest public.chemi_game_plays; nickname text;
begin
  select * into play from public.chemi_game_plays where match_share_id=p_share and game='match'
    and status='verified' and submitted_at>now()-interval '30 days';
  if not found then return null; end if;
  if p_key is null then
    select up.nickname into nickname from public.user_profiles up where up.app_user_id=play.user_id;
    return jsonb_build_object('character',play.character,'nickname',coalesce(nickname,''),
      'ticks',(play.input_log->>'ticks')::int,'misses',(play.input_log->>'misses')::int,
      'available',play.match_trial_at is null,'ranking',public.chemi_match_ranking(null,play.user_id));
  end if;
  -- Serialize concurrent claims. Only a retry carrying the original idempotency key gets its ticket.
  select * into play from public.chemi_game_plays where id=play.id for update;
  if not found then return null; end if;
  if play.match_trial_at is not null then
    if play.match_trial_receipt->>'key'=p_key::text and play.match_trial_at>now()-interval '2 minutes' then
      return play.match_trial_receipt-'key';
    end if;
    raise exception 'CHEMI_LIMIT';
  end if;
  insert into public.chemi_game_plays(game,character,map,kst_date,slot_kind,slot_no,seed)
    values('match',play.character,play.map,public.dukjil_kst_date(),'trial',1,play.seed) returning * into guest;
  update public.chemi_game_plays set match_trial_at=clock_timestamp(),
    match_trial_receipt=jsonb_build_object('key',p_key,'playId',guest.id,'game',guest.game,'character',guest.character,
      'seed',guest.seed,'issuedAt',guest.issued_at)
    where id=play.id returning * into play;
  return play.match_trial_receipt-'key';
end $$;

revoke all on function public.chemi_match_info(uuid,uuid),public.chemi_match_leave(uuid,uuid),
  public.chemi_match_ranking(uuid,uuid),public.chemi_match_lobby(uuid,boolean),
  public.chemi_match_finish(uuid,uuid,integer,jsonb),public.chemi_match_challenge(text,uuid) from public,anon,authenticated;
grant execute on function public.chemi_match_info(uuid,uuid),public.chemi_match_leave(uuid,uuid),
  public.chemi_match_ranking(uuid,uuid),
  public.chemi_match_lobby(uuid,boolean),public.chemi_match_finish(uuid,uuid,integer,jsonb),
  public.chemi_match_challenge(text,uuid) to service_role;

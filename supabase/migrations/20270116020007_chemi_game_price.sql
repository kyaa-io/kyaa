alter table public.chemi_game_plays drop constraint chemi_game_plays_slot_no_check,
  alter column slot_no type integer,
  add check (slot_no > 0 and (slot_kind='extra' or slot_no <= 3));

create function public.chemi_game_price(used integer) returns integer
language sql immutable strict set search_path='' as $$
  select case used when 0 then 100 when 1 then 300 when 2 then 500 else 1000 end
$$;

drop function public.chemi_issue_play(uuid,uuid,text,text,boolean);
create or replace function public.chemi_issue_play(p_user uuid,p_request_key uuid,p_game text,p_character text,p_extra boolean,p_expected_cost integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  play public.chemi_game_plays;
  fingerprint text := encode(sha256(convert_to(jsonb_build_array(p_game,p_character,p_extra)::text,'UTF8')),'hex');
  d date;
  bucket text := case when p_extra then 'extra' else 'free' end;
  slot integer;
  used integer;
  price integer;
begin
  perform public.chemi_lock_user(p_user,p_extra);
  d := public.dukjil_kst_date();
  if p_extra is null or p_request_key is null then raise exception 'CHEMI_INVALID'; end if;
  select * into play from public.chemi_game_plays where user_id=p_user and request_key=p_request_key;
  if found then
    if play.request_hash<>fingerprint then raise exception 'CHEMI_REQUEST_KEY_REUSED'; end if;
    return jsonb_build_object('playId',play.id,'seed',play.seed,'replayed',true);
  end if;
  if p_extra and (select count(*) from public.chemi_game_plays
    where user_id=p_user and game=p_game and kst_date=d and slot_kind='free' and status<>'refunded') < 3 then
    raise exception 'CHEMI_LIMIT';
  end if;
  if p_extra then
    select count(*),coalesce(max(slot_no),0)+1 into used,slot from public.chemi_game_plays
      where user_id=p_user and game=p_game and kst_date=d and slot_kind='extra' and status<>'refunded';
    price := public.chemi_game_price(used);
    if price is distinct from p_expected_cost then raise exception 'CHEMI_LIMIT'; end if;
  else
    select min(n) into slot from generate_series(1,3) n where not exists(
      select from public.chemi_game_plays where user_id=p_user and game=p_game and kst_date=d and slot_kind=bucket and slot_no=n and status<>'refunded');
    if slot is null then raise exception 'CHEMI_LIMIT'; end if;
  end if;
  insert into public.chemi_game_plays(user_id,game,character,map,kst_date,slot_kind,slot_no,request_key,request_hash,seed)
    values(p_user,p_game,p_character,p_character,d,bucket,slot,p_request_key,fingerprint,case when p_game='run' then
      ('x'||substr(encode(sha256(convert_to(to_char(d,'YYYYMMDD')||':run:v1','UTF8')),'hex'),1,8))::bit(32)::bigint % 2147483648
      else floor(random()*2147483648)::bigint end)
    returning * into play;
  if p_extra then
    begin
      update public.chemi_game_plays set ledger_id=public.group_wallet_post(p_user,'fan_point',-price,'chemi_game_extra',play.id)
        where id=play.id;
    exception when raise_exception then
      if sqlerrm in ('GROUP_WALLET_INVALID','GROUP_WALLET_UNAVAILABLE','GROUP_WALLET_WRITE_FENCED') then raise exception 'CHEMI_UNAVAILABLE'; end if;
      raise;
    end;
  end if;
  return jsonb_build_object('playId',play.id,'seed',play.seed,'replayed',false);
end $$;

revoke all on function public.chemi_issue_play(uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.chemi_issue_play(uuid,uuid,text,text,boolean,integer) to service_role;

create or replace function public.chemi_match_lobby(p_user uuid, p_sound boolean default null) returns jsonb
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
    'extraCost',public.chemi_game_price(extra_used),'points',public.group_wallet_balance(p_user,'fan_point'),'ranking',public.chemi_match_ranking(p_user),'previous',previous_result);
end $$;

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
    'extraCost',public.chemi_game_price(extra_used),'ranking',public.chemi_run_ranking(p_user),'previous',previous_result,
    'players',today_players,'best',coalesce(week_best,0),
    'points',public.group_wallet_balance(p_user,'fan_point'));
end $$;


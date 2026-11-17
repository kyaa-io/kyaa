create function public.chemi_claim_pending_points(p_user uuid,p_character text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare g public.chemi_point_grants; entry uuid; total integer := 0;
begin
  perform public.chemi_lock_user(p_user,true);
  for g in select * from public.chemi_point_grants grants where user_id=p_user
    and (p_character is null or character=p_character) and kst_date=public.dukjil_kst_date()
    and status in ('pending_passport','pending_wallet') and exists(
      select from public.fan_passports where app_user_id=p_user and celebrity_id=grants.celebrity_id)
  loop
    begin
      entry := public.group_wallet_post(p_user,'fan_point',3,'chemi_reward',g.id);
      update public.chemi_point_grants set status='granted',points=3,ledger_id=entry where id=g.id;
      total := total+3;
    exception when raise_exception then
      if sqlerrm not in ('GROUP_WALLET_INVALID','GROUP_WALLET_UNAVAILABLE','GROUP_WALLET_WRITE_FENCED') then raise; end if;
      update public.chemi_point_grants set status='pending_wallet' where id=g.id;
    end;
  end loop;
  return total;
end $$;
revoke all on function public.chemi_claim_pending_points(uuid,text) from public,anon,authenticated;
grant execute on function public.chemi_claim_pending_points(uuid,text) to service_role;

-- Server-only entry points. The caller resolves the favorite and canonical target
-- from trusted server data before submitting an engine result.
create function public.chemi_complete_reading(p_user uuid, p_content text, p_kind text,
  p_character text, p_celebrity uuid, p_target text, p_result jsonb, p_engine text, p_table text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d date := public.dukjil_kst_date();
  r public.chemi_readings;
  earned integer;
  monday date := date_trunc('week',d::timestamp)::date;
  achieved timestamptz := clock_timestamp();
  days integer;
  lot jsonb;
  reward jsonb := '{}';
begin
  perform public.chemi_lock_user(p_user,true);
  if p_kind not in ('daily','first','compat','friend_today') then
    raise exception 'CHEMI_UNAVAILABLE';
  end if;
  select * into r from public.chemi_readings where user_id=p_user and content=p_content
    and kind=p_kind and target_key=p_target and kst_date=d;
  if found then
    return jsonb_build_object('readingId',r.id,'result',r.result,'replayed',true,'reward','{}'::jsonb);
  end if;
  if p_kind in ('compat','friend_today') and exists (
    select from public.chemi_readings where user_id=p_user and kind=p_kind and kst_date=d
      and (p_kind='compat' or content=p_content) and target_key<>p_target
  ) then raise exception 'CHEMI_PAYMENT_REQUIRED'; end if;
  insert into public.chemi_readings(user_id,content,kind,character,kst_date,target_key,result,engine_version,table_version)
    values(p_user,p_content,p_kind,p_character,d,p_target,p_result,p_engine,p_table) returning * into r;
  if p_kind in ('daily','first') then
    if p_kind='daily' and p_content in ('fortune','star','tarot') then
      perform public.chemi_chain_enqueue('daily_reading','reading:'||r.id,p_user,
        jsonb_build_object('content',p_content,'character',p_character,'date',d),achieved,d);
    end if;
    insert into public.chemi_day_stamps(user_id,kst_date,first_content) values(p_user,d,p_content) on conflict do nothing;
    if found then reward := jsonb_build_object('stamp',true); end if;
    if p_character <> 'dosa' and p_celebrity is not null then
      insert into public.chemi_exp_log(user_id,character,source,kst_date,exp)
        values(p_user,p_character,p_content,d,case when p_content='saju' then 20 else 10 end)
        on conflict do nothing returning exp into earned;
      if found then
        insert into public.chemi_minis(user_id,character,exp_total) values(p_user,p_character,earned)
          on conflict(user_id,character) do update set exp_total=public.chemi_minis.exp_total+excluded.exp_total;
        reward := reward || jsonb_build_object('exp',earned);
      end if;
      insert into public.chemi_point_grants(user_id,character,celebrity_id,kst_date,status,reading_id)
        values(p_user,p_character,p_celebrity,d,'pending_passport',r.id) on conflict do nothing;
      if public.chemi_claim_pending_points(p_user,p_character)>0 then
        reward := reward || jsonb_build_object('points',3);
      end if;
      select count(distinct kst_date) into days from public.chemi_exp_log
        where user_id=p_user and source in ('fortune','saju','tarot','star') and kst_date between monday and d;
      reward := reward || jsonb_build_object('weekCount',days);
      if days>=5 then
        insert into public.chemi_week_boxes(user_id,week_start,achieved_at)
          values(p_user,monday,achieved) on conflict do nothing;
        if found then
          lot := public.chemi_pass_grant(p_user,'ask','weekly_free','weekly:'||p_user||':'||monday,1,achieved+interval '168 hours');
          update public.chemi_week_boxes set pass_lot_id=(lot->>'lotId')::uuid where user_id=p_user and week_start=monday;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('readingId',r.id,'result',r.result,'replayed',false,'reward',reward);
end $$;

create function public.chemi_issue_play(p_user uuid,p_request_key uuid,p_game text,p_character text,p_extra boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  play public.chemi_game_plays;
  fingerprint text := encode(sha256(convert_to(jsonb_build_array(p_game,p_character,p_extra)::text,'UTF8')),'hex');
  d date := public.dukjil_kst_date();
  bucket text := case when p_extra then 'extra' else 'free' end;
  slot integer;
begin
  perform public.chemi_lock_user(p_user,p_extra);
  if p_extra is null or p_request_key is null then raise exception 'CHEMI_INVALID'; end if;
  select * into play from public.chemi_game_plays where user_id=p_user and request_key=p_request_key;
  if found then
    if play.request_hash<>fingerprint then raise exception 'CHEMI_REQUEST_KEY_REUSED'; end if;
    return jsonb_build_object('playId',play.id,'seed',play.seed,'replayed',true);
  end if;
  select min(n) into slot from generate_series(1,3) n where not exists(
    select from public.chemi_game_plays where user_id=p_user and game=p_game and kst_date=d and slot_kind=bucket and slot_no=n);
  if slot is null then raise exception 'CHEMI_LIMIT'; end if;
  insert into public.chemi_game_plays(user_id,game,character,map,kst_date,slot_kind,slot_no,request_key,request_hash,seed)
    values(p_user,p_game,p_character,p_character,d,bucket,slot,p_request_key,fingerprint,floor(random()*2147483648))
    returning * into play;
  if p_extra then
    begin
      update public.chemi_game_plays set ledger_id=public.group_wallet_post(p_user,'fan_point',-10,'chemi_game_extra',play.id)
        where id=play.id;
    exception when raise_exception then
      if sqlerrm in ('GROUP_WALLET_INVALID','GROUP_WALLET_UNAVAILABLE','GROUP_WALLET_WRITE_FENCED') then raise exception 'CHEMI_UNAVAILABLE'; end if;
      raise;
    end;
  end if;
  return jsonb_build_object('playId',play.id,'seed',play.seed,'replayed',false);
end $$;

create function public.chemi_participation() returns jsonb language sql stable security definer set search_path='' as $$
  with counts as (
    select count(distinct user_id) filter(where kst_date=public.dukjil_kst_date()) as today,
      count(distinct user_id) filter(where kst_date>=date_trunc('week',public.dukjil_kst_date()::timestamp)::date) as week,
      count(distinct user_id) as total from public.chemi_readings where kst_date<=public.dukjil_kst_date()
  ) select case when today>=7 then jsonb_build_object('period','today','count',today)
    when week>=7 then jsonb_build_object('period','week','count',week)
    when total>0 then jsonb_build_object('period','all','count',total) end from counts
$$;
revoke all on function public.chemi_complete_reading(uuid,text,text,text,uuid,text,jsonb,text,text),
  public.chemi_issue_play(uuid,uuid,text,text,boolean),public.chemi_participation() from public,anon,authenticated;
grant execute on function public.chemi_complete_reading(uuid,text,text,text,uuid,text,jsonb,text,text),
  public.chemi_issue_play(uuid,uuid,text,text,boolean),public.chemi_participation() to service_role;

create function public.chemi_rewards_today(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed integer; grants jsonb;
begin
  claimed := public.chemi_claim_pending_points(p_user);
  select jsonb_agg(jsonb_build_object('character',character,'points',points) order by character)
    into grants from public.chemi_point_grants
    where user_id=p_user and kst_date=public.dukjil_kst_date() and status='granted';
  return jsonb_strip_nulls(jsonb_build_object('grants',coalesce(grants,'[]'::jsonb),'claimedPoints',nullif(claimed,0)));
end $$;
revoke all on function public.chemi_rewards_today(uuid) from public,anon,authenticated;
grant execute on function public.chemi_rewards_today(uuid) to service_role;

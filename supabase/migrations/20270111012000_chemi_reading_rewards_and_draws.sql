alter table public.chemi_point_grants add column content text;
update public.chemi_point_grants g set content=r.content from public.chemi_readings r where g.reading_id=r.id;
alter table public.chemi_point_grants drop constraint chemi_point_grants_user_id_character_kst_date_key,
  add unique(user_id,kst_date,content,character);

alter table public.chemi_game_plays drop constraint chemi_game_plays_user_id_game_kst_date_slot_kind_slot_no_key;
create unique index chemi_active_play_slot on public.chemi_game_plays(user_id,game,kst_date,slot_kind,slot_no)
  where status<>'refunded';

create or replace function public.chemi_complete_reading(p_user uuid, p_content text, p_kind text,
  p_character text, p_celebrity uuid, p_target text, p_result jsonb, p_engine text, p_table text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d date := public.dukjil_kst_date();
  r public.chemi_readings;
  replay boolean;
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
  replay := found;
  if not replay then
    if p_kind in ('compat','friend_today') and exists (
      select from public.chemi_readings where user_id=p_user and kind=p_kind and kst_date=d
        and (p_kind='compat' or content=p_content) and target_key<>p_target
    ) then raise exception 'CHEMI_PAYMENT_REQUIRED'; end if;
    insert into public.chemi_readings(user_id,content,kind,character,kst_date,target_key,result,engine_version,table_version)
      values(p_user,p_content,p_kind,p_character,d,p_target,p_result,p_engine,p_table) returning * into r;
  end if;
  if p_kind in ('daily','first') then
    if not replay and p_kind='daily' and p_content in ('fortune','star','tarot') then
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
      insert into public.chemi_point_grants(user_id,character,celebrity_id,kst_date,status,reading_id,content)
        values(p_user,p_character,p_celebrity,d,'pending_passport',r.id,p_content) on conflict do nothing;
      if public.chemi_claim_pending_points(p_user,p_character)>0 then
        reward := reward || jsonb_build_object('points',3);
      end if;
      if replay and reward = '{}'::jsonb then
        return jsonb_build_object('readingId',r.id,'result',r.result,'replayed',true,'reward',reward);
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
  return jsonb_build_object('readingId',r.id,'result',r.result,'replayed',replay,'reward',reward);
end $$;

create function public.chemi_reading_context(p_user uuid,p_content text,p_kind text,p_target text,p_character text,p_celebrity uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=public.dukjil_kst_date(); r public.chemi_readings; saved jsonb;
begin
  perform public.chemi_claim_pending_points(p_user);
  select * into r from public.chemi_readings where user_id=p_user and content=p_content and kind=p_kind and target_key=p_target and kst_date=d;
  if found then
    saved:=public.chemi_save_reading(p_user,p_content,p_kind,p_character,p_celebrity,p_target,
      r.result,r.engine_version,r.table_version,d);
  end if;
  return jsonb_build_object('day',d,'saved',saved);
end $$;
revoke all on function public.chemi_reading_context(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.chemi_reading_context(uuid,text,text,text,text,uuid) to service_role;

create or replace function public.chemi_issue_play(p_user uuid,p_request_key uuid,p_game text,p_character text,p_extra boolean)
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
  if p_extra and (select count(*) from public.chemi_game_plays
    where user_id=p_user and game=p_game and kst_date=d and slot_kind='free' and status<>'refunded') < 3 then
    raise exception 'CHEMI_LIMIT';
  end if;
  select min(n) into slot from generate_series(1,3) n where not exists(
    select from public.chemi_game_plays where user_id=p_user and game=p_game and kst_date=d and slot_kind=bucket and slot_no=n and status<>'refunded');
  if slot is null then raise exception 'CHEMI_LIMIT'; end if;
  insert into public.chemi_game_plays(user_id,game,character,map,kst_date,slot_kind,slot_no,request_key,request_hash,seed)
    values(p_user,p_game,p_character,p_character,d,bucket,slot,p_request_key,fingerprint,case when p_game='run' then
      ('x'||substr(encode(sha256(convert_to(to_char(d,'YYYYMMDD')||':run:v1','UTF8')),'hex'),1,8))::bit(32)::bigint % 2147483648
      else floor(random()*2147483648)::bigint end)
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

create or replace function public.chemi_refund_play(p_user uuid,p_play uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare play public.chemi_game_plays; entry uuid;
begin
  perform public.chemi_lock_user(p_user,true);
  select * into play from public.chemi_game_plays where id=p_play and user_id=p_user for update;
  if not found or play.slot_kind not in ('extra','free') or (play.slot_kind='extra' and play.ledger_id is null) or play.status not in ('issued','refunded') then
    raise exception 'CHEMI_INVALID';
  end if;
  if play.slot_kind='extra' then
    entry := public.group_wallet_post(p_user,'fan_point',10,'chemi_game_refund',play.id);
  end if;
  update public.chemi_game_plays set status='refunded' where id=p_play;
  return entry;
end $$;

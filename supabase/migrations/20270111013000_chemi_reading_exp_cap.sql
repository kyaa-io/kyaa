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
    if p_character = 'dosa' or p_celebrity is not null then
      insert into public.chemi_exp_log(user_id,character,source,kst_date,exp)
        select p_user,p_character,p_content,d,case when p_content='saju' then 20 else 10 end
        where (select count(*) from public.chemi_exp_log
          where user_id=p_user and source=p_content and kst_date=d) < 3
        on conflict do nothing returning exp into earned;
      if found then
        insert into public.chemi_minis(user_id,character,exp_total) values(p_user,p_character,earned)
          on conflict(user_id,character) do update set exp_total=public.chemi_minis.exp_total+excluded.exp_total;
        reward := reward || jsonb_build_object('exp',earned);
      end if;
      if p_celebrity is not null then
        insert into public.chemi_point_grants(user_id,character,celebrity_id,kst_date,status,reading_id,content)
          values(p_user,p_character,p_celebrity,d,'pending_passport',r.id,p_content) on conflict do nothing;
        if public.chemi_claim_pending_points(p_user,p_character)>0 then
          reward := reward || jsonb_build_object('points',3);
        end if;
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

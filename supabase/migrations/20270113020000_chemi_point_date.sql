-- A saved date reading and its point movements commit together.
do $$
declare f text := pg_get_functiondef('public.group_wallet_post(uuid,text,bigint,text,uuid)'::regprocedure);
begin
  if regexp_count(f,'''chemi_game_refund''') <> 1 then raise exception 'CHEMI_WALLET_CONTRACT_CHANGED'; end if;
  execute replace(f,'''chemi_game_refund''','''chemi_game_refund'',''chemi_date''');
end $$;

create function public.chemi_point_date(p_user uuid,p_character text,p_day date,p_result jsonb,p_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  target text := p_character || ':' || to_char(p_day,'YYYY-MM-DD');
  price constant integer := 3;
  free_balance bigint;
  paid_balance bigint;
  free_used bigint;
  entitlement uuid;
  saved public.chemi_readings;
begin
  perform public.chemi_lock_user(p_user,true);
  perform public.group_wallet_lock(p_user);
  if p_day is null or p_character is null or p_character not in ('dosa','changha','yuna','elina') then raise exception 'CHEMI_INVALID'; end if;
  select * into saved from public.chemi_readings where user_id=p_user and content='fortune' and kind='date' and target_key=target and kst_date=p_day;
  select activity_points, paid_points into free_balance, paid_balance from public.chemi_point_balances(p_user);
  if saved.id is not null then
    return jsonb_build_object('price',0,'balance',free_balance+paid_balance,'readingId',saved.id,'result',saved.result,'kstDate',p_day,'replayed',true);
  end if;
  if p_day=public.dukjil_kst_date() then
    return jsonb_build_object('price',0,'balance',free_balance+paid_balance,'todayFree',true);
  end if;
  if p_result is null or free_balance+paid_balance<price then
    return jsonb_build_object('price',price,'balance',free_balance+paid_balance);
  end if;
  if p_result->'locked' is distinct from 'false'::jsonb then raise exception 'CHEMI_UNAVAILABLE'; end if;
  insert into public.chemi_entitlements(user_id,kind,target_key,opened_at) values(p_user,'fortune_date',target,now()) returning id into entitlement;
  free_used := least(price,free_balance);
  if free_used>0 then perform public.group_wallet_post(p_user,'fan_point',-free_used,'chemi_date',entitlement); end if;
  if price>free_used then
    if public.chemi_debit_paid_points(p_user,entitlement,(price-free_used)::integer) <> price-free_used then
      raise exception 'CHEMI_UNAVAILABLE';
    end if;
  end if;
  insert into public.chemi_readings(user_id,content,kind,character,kst_date,target_key,result,engine_version,table_version)
    values(p_user,'fortune','date',p_character,p_day,target,p_result,p_version,p_version) returning * into saved;
  return jsonb_build_object('price',price,'balance',free_balance+paid_balance-price,'readingId',saved.id,'result',saved.result,'kstDate',p_day);
end $$;
revoke all on function public.chemi_point_date(uuid,text,date,jsonb,text) from public,anon,authenticated;
grant execute on function public.chemi_point_date(uuid,text,date,jsonb,text) to service_role;

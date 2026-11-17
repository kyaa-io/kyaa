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
    where user_id=p_user and game=p_game and kst_date=d and slot_kind='free') < 3 then
    raise exception 'CHEMI_LIMIT';
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

create function public.chemi_visit(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.chemi_lock_user(p_user,false);
  insert into public.chemi_user_state(user_id,last_visit_date) values(p_user,public.dukjil_kst_date())
    on conflict(user_id) do update set last_visit_date=excluded.last_visit_date,updated_at=now();
  return '{"dot":false}';
end $$;

create function public.chemi_reading_list(p_user uuid,p_content text,p_from date,p_to date) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('readingId',id,'date',kst_date,'content',content,
    'character',character,'kind',kind) order by created_at desc,id),'[]') from public.chemi_readings
    where user_id=p_user and (p_content is null or content=p_content)
      and (p_from is null or kst_date>=p_from) and (p_to is null or kst_date<=p_to)
$$;

create function public.chemi_create_share(p_user uuid,p_reading uuid,p_character text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid text := replace(gen_random_uuid()::text,'-',''); shared_content text;
begin
  perform public.chemi_lock_user(p_user,false);
  insert into public.chemi_share_cards(id,user_id,content,character,reading_id,card,expires_at)
    select sid,p_user,r.content,p_character,r.id,jsonb_strip_nulls(jsonb_build_object(
      'content',r.content,'character',p_character,
      'line',style.text#>'{share,line}','keywords',style.text#>'{share,keywords}',
      'card',case when r.content='tarot' then r.result#>'{cards,0,card}' end,
      'reversed',case when r.content='tarot' then r.result#>'{cards,0,reversed}' end)),now()+interval '30 days'
    from public.chemi_readings r left join public.chemi_reading_styles style
      on style.reading_id=r.id and style.character=p_character and style.locale='ko'
    where r.user_id=p_user and r.id=p_reading returning content into shared_content;
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  return jsonb_build_object('shareId',sid,'url','/chemi/'||shared_content||'?from='||sid);
end $$;

create function public.chemi_get_share(p_share text) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select card from public.chemi_share_cards where id=p_share and deleted_at is null and expires_at>now()),'{"gone":true}')
$$;

create function public.chemi_share_done(p_user uuid,p_share text,p_via text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.chemi_share_cards; d date:=public.dukjil_kst_date(); w date:=date_trunc('week',d::timestamp)::date;
  reward jsonb:='{}';
begin
  perform public.chemi_lock_user(p_user,false);
  if p_via is null or p_via not in ('save','copy','send') then raise exception 'CHEMI_INVALID'; end if;
  select * into s from public.chemi_share_cards where id=p_share and user_id=p_user and deleted_at is null and expires_at>now();
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  insert into public.chemi_share_rewards(user_id,kind,key) values(p_user,'result_once',s.reading_id::text) on conflict do nothing;
  if not found then return '{"reward":{}}'; end if;
  insert into public.chemi_share_rewards(user_id,kind,key) values(p_user,'week_pass',w::text) on conflict do nothing;
  if found then
    perform public.chemi_pass_grant(p_user,'ask','share','share:'||p_user||':'||w,1,now()+interval '168 hours');
    reward := '{"pass":1}';
  end if;
  if s.character<>'dosa' then
    insert into public.chemi_share_rewards(user_id,kind,key) values(p_user,'day_exp',d||':'||s.character) on conflict do nothing;
    if found then
      insert into public.chemi_exp_log(user_id,character,source,kst_date,exp) values(p_user,s.character,'share',d,5);
      insert into public.chemi_minis(user_id,character,exp_total) values(p_user,s.character,5)
        on conflict(user_id,character) do update set exp_total=public.chemi_minis.exp_total+5;
      reward := reward || '{"exp":5}'::jsonb;
    end if;
  end if;
  return jsonb_build_object('reward',reward);
end $$;

-- Internal recovery only. The trusted game adjudicator calls this for a transport failure.
create function public.chemi_refund_play(p_user uuid,p_play uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare play public.chemi_game_plays; entry uuid;
begin
  perform public.chemi_lock_user(p_user,true);
  select * into play from public.chemi_game_plays where id=p_play and user_id=p_user for update;
  if not found or play.slot_kind<>'extra' or play.ledger_id is null or play.status not in ('issued','refunded') then
    raise exception 'CHEMI_INVALID';
  end if;
  entry := public.group_wallet_post(p_user,'fan_point',10,'chemi_game_refund',play.id);
  update public.chemi_game_plays set status='refunded' where id=p_play;
  return entry;
end $$;
revoke all on function public.chemi_visit(uuid) from public,anon,authenticated;
grant execute on function public.chemi_visit(uuid) to service_role;
revoke all on function public.chemi_reading_list(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.chemi_reading_list(uuid,text,date,date) to service_role;
revoke all on function public.chemi_create_share(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.chemi_create_share(uuid,uuid,text) to service_role;
revoke all on function public.chemi_get_share(text) from public,anon,authenticated;
grant execute on function public.chemi_get_share(text) to service_role;
revoke all on function public.chemi_share_done(uuid,text,text) from public,anon,authenticated;
grant execute on function public.chemi_share_done(uuid,text,text) to service_role;
revoke all on function public.chemi_refund_play(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chemi_refund_play(uuid,uuid) to service_role;

create function public.chemi_reading_detail(p_user uuid,p_id uuid,p_character text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
  select jsonb_build_object('readingId',r.id,'result',r.result,'styled',s.text) into payload from public.chemi_readings r
    left join public.chemi_reading_styles s on s.reading_id=r.id and s.character=coalesce(p_character,r.character) and s.locale='ko'
    where r.user_id=p_user and r.id=p_id;
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  return payload;
end $$;
revoke all on function public.chemi_reading_detail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.chemi_reading_detail(uuid,uuid,text) to service_role;

-- Resolve the KST date on the same clock as reward eligibility. A replay also
-- settles newly eligible points without running an engine again.
create function public.chemi_reading_context(p_user uuid,p_content text,p_kind text,p_target text,p_character text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=public.dukjil_kst_date(); r public.chemi_readings; saved jsonb;
begin
  perform public.chemi_claim_pending_points(p_user);
  select * into r from public.chemi_readings where user_id=p_user and content=p_content and kind=p_kind and target_key=p_target and kst_date=d;
  if found then
    saved:=public.chemi_reading_detail(p_user,r.id,p_character)||jsonb_build_object('reward','{}'::jsonb,'replayed',true,
      'chain',case when r.kind='daily' and r.content in ('fortune','star','tarot') then 'pending' end);
  end if;
  return jsonb_build_object('day',d,'saved',saved);
end $$;
revoke all on function public.chemi_reading_context(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.chemi_reading_context(uuid,text,text,text,text) to service_role;

-- Keep engine day, saved row and reward attribution together at KST midnight.
create function public.chemi_save_reading(p_user uuid,p_content text,p_kind text,p_character text,
  p_celebrity uuid,p_target text,p_result jsonb,p_engine text,p_table text,p_day date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb; reward jsonb; details jsonb;
begin
  perform public.chemi_lock_user(p_user,true);
  if p_day is distinct from public.dukjil_kst_date() then raise exception 'CHEMI_UNAVAILABLE'; end if;
  saved:=public.chemi_complete_reading(p_user,p_content,p_kind,p_character,p_celebrity,p_target,p_result,p_engine,p_table);
  reward:=saved->'reward';
  if reward ? 'weekCount' then reward:=(reward-'weekCount')||jsonb_build_object('week',reward->'weekCount'); end if;
  details:=public.chemi_reading_detail(p_user,(saved->>'readingId')::uuid,p_character);
  return saved||details||jsonb_build_object('reward',reward,'chain',case when p_kind='daily' and p_content in ('fortune','star','tarot') then 'pending' end);
end $$;
revoke all on function public.chemi_save_reading(uuid,text,text,text,uuid,text,jsonb,text,text,date) from public,anon,authenticated;
grant execute on function public.chemi_save_reading(uuid,text,text,text,uuid,text,jsonb,text,text,date) to service_role;

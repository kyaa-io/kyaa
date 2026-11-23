-- 공유 카드가 결과에서 만든 한 줄을 담는다(DF-FORT-003).
-- 지금까지 줄은 말투로 다시 쓴 풀이(chemi_reading_styles)에서만 왔는데 그 표를 채우는 곳이 없어
-- 운세·사주 공유 링크를 받은 사람은 모두 빈 화면을 봤다. 서버가 저장된 결과로 만든 요약(p_summary)을 받아
-- 말투 줄이 없을 때 그 줄을 쓴다. 요약은 서버 코드가 만들고 사용자 입력을 받지 않는다.
create function public.chemi_create_share(p_user uuid,p_reading uuid,p_character text,p_summary jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid text := replace(gen_random_uuid()::text,'-',''); shared_content text;
begin
  if p_summary is null or jsonb_typeof(p_summary)<>'object' or length(p_summary::text)>2000 then
    raise exception 'CHEMI_INVALID';
  end if;
  perform public.chemi_lock_user(p_user,false);
  insert into public.chemi_share_cards(id,user_id,content,character,reading_id,card,expires_at)
    select sid,p_user,r.content,p_character,r.id,jsonb_strip_nulls(jsonb_build_object(
      'content',r.content,'character',p_character,'day',r.kst_date,
      'line',coalesce(style.text#>'{share,line}',p_summary->'line'),
      'title',p_summary->'title','score',p_summary->'score','grade',p_summary->'grade',
      'keywords',coalesce(style.text#>'{share,keywords}',p_summary->'keywords'),
      'card',case when r.content='tarot' then r.result#>'{cards,0,card}' end,
      'reversed',case when r.content='tarot' then r.result#>'{cards,0,reversed}' end)),now()+interval '30 days'
    from public.chemi_readings r left join public.chemi_reading_styles style
      on style.reading_id=r.id and style.character=p_character and style.locale='ko'
    where r.user_id=p_user and r.id=p_reading returning content into shared_content;
  if not found then raise exception 'CHEMI_NOT_FOUND'; end if;
  return jsonb_build_object('shareId',sid,'url','/chemi/'||shared_content||'?from='||sid);
end $$;
revoke all on function public.chemi_create_share(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.chemi_create_share(uuid,uuid,text,jsonb) to service_role;

-- 지났거나 지운 카드도 어느 콘텐츠·최애의 카드였는지는 돌려준다: 받은 사람이 빈 화면 대신 그 최애의 첫 장면으로 간다.
create or replace function public.chemi_get_share(p_share text) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(
    (select case when deleted_at is null and expires_at>now() then card
      else jsonb_build_object('gone',true,'content',content,'character',character) end
     from public.chemi_share_cards where id=p_share),
    '{"gone":true}')
$$;
revoke all on function public.chemi_get_share(text) from public,anon,authenticated;
grant execute on function public.chemi_get_share(text) to service_role;

-- 오늘 패스포트가 없어 보류된 3P 도 돌려준다(DF-FORT-002): 결과 보상 줄이 '패스포트 받고 +3P · 스탬프'를 보인다.
-- 'grants' 모양은 그대로 두고 'pending'(최애 slug 목록)만 더한다. 보류 행이 없으면 키를 빼는 것은 기존과 같다.
create or replace function public.chemi_rewards_today(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed integer; grants jsonb; pending jsonb;
begin
  claimed := public.chemi_claim_pending_points(p_user);
  select jsonb_agg(jsonb_build_object('character',character,'points',points) order by character)
    into grants from public.chemi_point_grants
    where user_id=p_user and kst_date=public.dukjil_kst_date() and status='granted';
  select jsonb_agg(character order by character) into pending from public.chemi_point_grants
    where user_id=p_user and kst_date=public.dukjil_kst_date() and status='pending_passport';
  return jsonb_strip_nulls(jsonb_build_object('grants',coalesce(grants,'[]'::jsonb),'pending',pending,'claimedPoints',nullif(claimed,0)));
end $$;
revoke all on function public.chemi_rewards_today(uuid) from public,anon,authenticated;
grant execute on function public.chemi_rewards_today(uuid) to service_role;

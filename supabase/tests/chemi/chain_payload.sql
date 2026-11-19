-- 케미 M1 · 기록 허용 목록 거절 시험(설계 arch-chemi r3 §7.3 겹 5). 일회용 DB 에서만, 끝에 되돌린다.
-- 생일·시간·별명·이메일·회원 번호·전화·사용자 uuid 를 값 자리와 키 자리에 넣어 전부 거절되는지,
-- 허용 코드 집합 밖의 그럴듯한 값(다른 날짜, 없는 카드 번호)도 거절되는지 본다.
begin;
create function pg_temp.ok(k text, p jsonb, d date) returns void language plpgsql as $$
begin perform public.chemi_chain_payload_check(k, p, d); end $$;
create function pg_temp.rejected(k text, p jsonb, d date) returns void language plpgsql as $$
begin
  perform public.chemi_chain_payload_check(k, p, d);
  raise exception 'chain_payload: accepted % %', k, p;
exception when others then
  if sqlerrm <> 'CHEMI_CHAIN_PAYLOAD_REJECTED' then raise; end if;
end $$;
do $$
declare d date := date '2027-01-13'; -- 수요일, 주 = 2027-01-11
  base jsonb := '{"content":"fortune","character":"changha","date":"2027-01-13","band":50}';
  pii jsonb := jsonb_build_array('1995-05-05', '14:30', '민지', 'fan@example.com', '010-1234-5678', 'a3e1c2d4-0000-4000-8000-000000000001', 19950505, 'did:privy:abc');
  v jsonb; k text;
begin
  -- 통과하는 것(종류마다 1개)
  perform pg_temp.ok('daily_reading', base, d);
  perform pg_temp.ok('daily_reading', '{"content":"tarot","character":"dosa","date":"2027-01-13","card":77}', d);
  perform pg_temp.ok('saju_first', jsonb_build_object('character','yuna','date','2027-01-13','reading',12,'resultHash',repeat('ab',32)), d);
  perform pg_temp.ok('saju_topic', jsonb_build_object('character','yuna','date','2027-01-13','topic','love','resultHash',repeat('0f',32)), d);
  perform pg_temp.ok('tarot3', '{"character":"elina","date":"2027-01-13","spread":1,"topic":3,"cards":[0,21,77]}', d);
  perform pg_temp.ok('game_best', '{"game":"run","map":"changha","date":"2027-01-13","score":4820}', d);
  perform pg_temp.ok('charm', '{"charm":3,"character":"changha","date":"2027-01-13"}', d);
  perform pg_temp.ok('card', '{"card":7,"character":"elina","date":"2027-01-13"}', d);
  perform pg_temp.ok('album', '{"character":"yuna","slot":2,"stage":5}', d);
  perform pg_temp.ok('week5', '{"week":"2027-01-11","days":5}', d);
  perform pg_temp.ok('box_item', '{"week":"2027-01-11","item":42}', d);
  perform pg_temp.ok('title', '{"title":9,"date":"2027-01-13"}', d);
  perform pg_temp.ok('rank', '{"week":"2027-01-11","game":"match","map":"dosa","rank":12,"score":4820}', d);
  perform pg_temp.ok('rank_table', jsonb_build_object('week','2027-01-11','game','run','map','yuna','root',repeat('cd',32)), d);

  -- 개인정보를 값 자리에: 허용 키마다 넣어 본다
  for k in select jsonb_object_keys(base) loop
    for v in select value from jsonb_array_elements(pii) loop
      perform pg_temp.rejected('daily_reading', base || jsonb_build_object(k, v), d);
    end loop;
  end loop;
  -- 개인정보를 키 자리에 · 모르는 키
  for k in select unnest(array['birth','birthDate','birthTime','nickname','email','phone','userId','user_id','appUserId','memberNo','wallet','zodiac','ilju','ttí','sign','ascendant']) loop
    perform pg_temp.rejected('daily_reading', base || jsonb_build_object(k, 'x'), d);
  end loop;
  for v in select value from jsonb_array_elements(pii) loop
    perform pg_temp.rejected('daily_reading', base || jsonb_build_object(v #>> '{}', 1), d);
  end loop;

  -- 그럴듯하지만 허용 집합 밖
  perform pg_temp.rejected('daily_reading', base || '{"date":"2027-01-12"}', d);      -- 다른 날짜
  perform pg_temp.rejected('daily_reading', base || '{"date":"1995-05-05"}', d);      -- 생일 같은 날짜
  perform pg_temp.rejected('daily_reading', base || '{"band":55}', d);                -- 10점 단위 아님
  perform pg_temp.rejected('daily_reading', base || '{"band":100}', d);
  perform pg_temp.rejected('daily_reading', base || '{"band":50.5}', d);
  perform pg_temp.rejected('daily_reading', base || '{"band":"50"}', d);              -- 숫자 꼴 문자열
  perform pg_temp.rejected('daily_reading', base || '{"card":78}', d);                -- 없는 카드 번호
  perform pg_temp.rejected('daily_reading', base || '{"content":"saju"}', d);         -- 사주는 daily 기록이 아님
  perform pg_temp.rejected('daily_reading', base || '{"content":"compat"}', d);       -- 궁합은 올리지 않음
  perform pg_temp.rejected('daily_reading', base || '{"character":"minji"}', d);
  perform pg_temp.rejected('daily_reading', base - 'date', d);                        -- 필수 키 없음
  perform pg_temp.rejected('daily_reading', '[]', d);
  perform pg_temp.rejected('daily_reading', base, null);
  perform pg_temp.rejected('compat', base, d);                                         -- 없는 종류
  perform pg_temp.rejected('ask', base, d);
  perform pg_temp.rejected('order', '{"amount":1900}', d);
  perform pg_temp.rejected('tarot3', '{"character":"elina","date":"2027-01-13","spread":1,"topic":3,"cards":[0,21,21]}', d); -- 같은 카드 두 번
  perform pg_temp.rejected('tarot3', '{"character":"elina","date":"2027-01-13","spread":1,"topic":3,"cards":[0,21]}', d);
  perform pg_temp.rejected('tarot3', '{"character":"elina","date":"2027-01-13","spread":1,"topic":3,"cards":[0,21,"77"]}', d);
  perform pg_temp.rejected('saju_first', jsonb_build_object('character','yuna','date','2027-01-13','reading',12,'resultHash',repeat('AB',32)), d);
  perform pg_temp.rejected('saju_first', jsonb_build_object('character','yuna','date','2027-01-13','reading',12,'resultHash','1995-05-05'), d);
  perform pg_temp.rejected('week5', '{"week":"2027-01-13","days":5}', d);             -- 주차는 월요일만
  perform pg_temp.rejected('week5', '{"week":"2027-01-04","days":5}', d);             -- 다른 주
  perform pg_temp.rejected('week5', '{"week":"2027-01-11","days":4}', d);
  perform pg_temp.rejected('album', '{"character":"dosa","slot":2,"stage":5}', d);     -- 도사는 앨범 없음
  perform pg_temp.rejected('album', '{"character":"yuna","slot":2,"stage":7}', d);
  perform pg_temp.rejected('game_best', '{"game":"run","map":"changha","date":"2027-01-13","score":-1}', d);
  perform pg_temp.rejected('rank_table', jsonb_build_object('week','2027-01-11','game','run','map','yuna','root',repeat('cd',32),'top',jsonb_build_array('민지')), d);
end $$;
select 'chain_payload ok' as result;
rollback;

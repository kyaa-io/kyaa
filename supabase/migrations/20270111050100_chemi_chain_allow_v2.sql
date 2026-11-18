-- 생성물 · 손으로 고치지 않는다. 원본 apps/web/server/chemi-chain/chain-schema.ts (schema v2).
-- 다시 만들기: node scripts/chemi-chain-schema-sql.mjs · 검사: node scripts/chemi-chain-schema-sql.mjs --check
-- 케미 기록 대기열에 들어가는 payload 를 kind 별 허용 키·허용 값으로만 통과시킨다(설계 arch-chemi r3 §7.3 겹 1).
-- 목록 밖 키·값, 그 기록의 한국 날짜·주차와 다른 날짜는 CHEMI_CHAIN_PAYLOAD_REJECTED. 오류에는 값을 싣지 않는다.
create or replace function public.chemi_chain_payload_check(p_kind text, p_payload jsonb, p_kst_date date) returns void
language plpgsql immutable set search_path = '' as $fn$
declare
  spec constant jsonb := '{"daily_reading":{"required":{"content":{"t":"enum","v":["fortune","star","tarot"]},"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"}},"optional":{"band":{"t":"int","min":0,"max":90,"step":10},"card":{"t":"int","min":0,"max":77}}},"saju_first":{"required":{"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"},"reading":{"t":"int","min":1,"max":9999},"resultHash":{"t":"hex64"}}},"saju_topic":{"required":{"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"},"topic":{"t":"enum","v":["daeun","love","money","work","health"]},"resultHash":{"t":"hex64"}}},"tarot3":{"required":{"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"},"spread":{"t":"int","min":1,"max":9},"topic":{"t":"int","min":1,"max":99},"cards":{"t":"intarray","len":3,"min":0,"max":77,"distinct":true}}},"game_best":{"required":{"game":{"t":"enum","v":["run","match"]},"map":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"},"score":{"t":"int","min":0,"max":10000000}}},"charm":{"required":{"charm":{"t":"int","min":1,"max":999},"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"}}},"card":{"required":{"card":{"t":"int","min":1,"max":999},"character":{"t":"enum","v":["changha","elina","yuna","dosa"]},"date":{"t":"date"}}},"album":{"required":{"character":{"t":"enum","v":["changha","elina","yuna"]},"slot":{"t":"int","min":1,"max":6},"stage":{"t":"intset","v":[0,5,10,15,20,30]}}},"week5":{"required":{"week":{"t":"week"},"days":{"t":"int","min":5,"max":7}}},"box_item":{"required":{"week":{"t":"week"},"item":{"t":"int","min":1,"max":999}}},"title":{"required":{"title":{"t":"int","min":1,"max":999},"date":{"t":"date"}}},"rank":{"required":{"week":{"t":"week"},"game":{"t":"enum","v":["run","match"]},"map":{"t":"enum","v":["changha","elina","yuna","dosa"]},"rank":{"t":"int","min":1,"max":1000000},"score":{"t":"int","min":0,"max":10000000}}},"rank_table":{"required":{"week":{"t":"week"},"game":{"t":"enum","v":["run","match","all"]},"map":{"t":"enum","v":["changha","elina","yuna","dosa","all"]},"root":{"t":"hex64"}}}}'::jsonb;
  kind_spec jsonb; rules jsonb; rule jsonb; key text; val jsonb; n numeric; item jsonb; seen numeric[];
begin
  if p_kind is null or p_payload is null or p_kst_date is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'shape';
  end if;
  kind_spec := spec -> p_kind;
  if kind_spec is null then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'kind'; end if;
  rules := coalesce(kind_spec -> 'required', '{}'::jsonb) || coalesce(kind_spec -> 'optional', '{}'::jsonb);
  for key in select jsonb_object_keys(coalesce(kind_spec -> 'required', '{}'::jsonb)) loop
    if not p_payload ? key then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'missing:' || key; end if;
  end loop;
  for key, val in select e.key, e.value from jsonb_each(p_payload) e loop
    rule := rules -> key;
    if rule is null then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'key'; end if;
    if not (case rule ->> 't'
      when 'enum' then jsonb_typeof(val) = 'string' and (rule -> 'v') @> jsonb_build_array(val)
      when 'int' then jsonb_typeof(val) = 'number'
        and (val #>> '{}')::numeric = trunc((val #>> '{}')::numeric)
        and (val #>> '{}')::numeric between (rule ->> 'min')::numeric and (rule ->> 'max')::numeric
        and (rule -> 'step' is null or mod((val #>> '{}')::numeric, (rule ->> 'step')::numeric) = 0)
      when 'intset' then jsonb_typeof(val) = 'number' and (rule -> 'v') @> jsonb_build_array(val)
      when 'date' then jsonb_typeof(val) = 'string' and val #>> '{}' = to_char(p_kst_date, 'YYYY-MM-DD')
      when 'week' then jsonb_typeof(val) = 'string'
        and val #>> '{}' = to_char(p_kst_date - (extract(isodow from p_kst_date)::integer - 1), 'YYYY-MM-DD')
      when 'hex64' then jsonb_typeof(val) = 'string' and val #>> '{}' ~ '^[0-9a-f]{64}$'
      when 'intarray' then jsonb_typeof(val) = 'array' and jsonb_array_length(val) = (rule ->> 'len')::integer
      else false end) then
      raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key;
    end if;
    if rule ->> 't' = 'intarray' then
      seen := '{}';
      for item in select a.value from jsonb_array_elements(val) a loop
        if jsonb_typeof(item) <> 'number' then raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key; end if;
        n := (item #>> '{}')::numeric;
        if n <> trunc(n) or n < (rule ->> 'min')::numeric or n > (rule ->> 'max')::numeric
          or ((rule ->> 'distinct')::boolean and n = any(seen)) then
          raise exception 'CHEMI_CHAIN_PAYLOAD_REJECTED' using errcode = '22023', detail = 'value:' || key;
        end if;
        seen := seen || n;
      end loop;
    end if;
  end loop;
end $fn$;
revoke all on function public.chemi_chain_payload_check(text, jsonb, date) from public, anon, authenticated, service_role;

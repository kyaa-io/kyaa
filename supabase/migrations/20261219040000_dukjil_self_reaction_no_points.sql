-- 본인 글에 본인이 누른 좋아요(공감)는 포인트·스탬프를 주지 않는다(감독 2026-11-09 05:29, QA-I: 본인 글 좋아요 +1P).
-- 좋아요 자체(fan_post_likes, 좋아요 수)는 그대로다. 적립 경로는 fan-posts like → record_dukjil_action('reaction', 'post-like:<글 id>').
-- 글 작성자 = 행위자이면 정상 응답(points 0, stampId null, reason 'SELF_REACTION', replayed false)을 돌려주고 행동 기록·지갑·스탬프를
-- 쓰지 않는다. 예외로 거절하지 않으므로 배포 중인 웹도 실패 기록(record_dukjil_award_failure)을 남기지 않는다.
-- 검토(2026-11-09): 경로의 글 id는 대문자도 통과하므로(z.uuid()) 'post-like:' source는 대소문자 없이 판정하고, 함수 안에서 소문자로
-- 바꿔 기록·중복 판정에 쓴다. 대문자 id로 같은 글을 다시 지급받거나 자기 반응 판정을 피할 수 없다. 대문자로 들어온 요청은 소문자 source의
-- 기존 기록과 요청 키가 달라 SOURCE_REUSED(지급 없음, 웹은 조용히 넘김)가 된다. 이미 쌓인 대문자 source 행은 바꾸지 않는다.
-- 이미 지급된 같은 글의 기록은 replay로 이전 결과를 돌려준다(새 지급 없음). 이미 쌓인 자기 반응 포인트는 회수하지 않는다.
-- 하루 5회 한도(pointCap)·같은 글 재지급 방지·다른 행동 규칙은 그대로다. 크리에이터 페이지 반응('creator-reaction:')은 작성자가 없어 해당 없음.
-- 현재 정의를 읽어 두 곳에 줄을 넣으므로 소유자·권한은 유지된다. 이미 바뀐 정의면 아무것도 하지 않는다.
-- Rollback: supabase/rollback/20261219040000_dukjil_self_reaction_no_points.sql.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(sig);
  lock_anchor constant text := $a$  perform public.group_wallet_lock(p_user);$a$;
  lower_key constant text := $a$  -- 20261219040000: a fan-post like keys on the lowercase post id, whatever case the path carried.
  if p_source_key ~* '^post-like:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    p_source_key := pg_catalog.lower(p_source_key);
  end if;
$a$;
  self_anchor constant text := $a$  -- 20261219020000: post pays at any length; the other actions keep their policy minChars.$a$;
  self_check constant text := $a$  -- 20261219040000: a like on your own post pays nothing (no points, no stamp, no log row); the like itself stays.
  if p_action_key = 'reaction' and p_source_key ~* '^post-like:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists(select 1 from public.fan_posts fp where fp.id = pg_catalog.substr(p_source_key, 11)::uuid and fp.app_user_id = p_user) then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', false, 'reason', 'SELF_REACTION', 'replayed', false);
  end if;
$a$;
  a text; hits integer;
begin
  if pg_catalog.strpos(definition, self_check) > 0 then return; end if;
  foreach a in array array[lock_anchor, self_anchor] loop
    hits := (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, a, ''))) / pg_catalog.length(a);
    if hits <> 1 then raise exception 'record_dukjil_action anchor % found % times (expected 1)', a, hits; end if;
  end loop;
  definition := pg_catalog.replace(definition, lock_anchor, lower_key || lock_anchor);
  definition := pg_catalog.replace(definition, self_anchor, self_check || self_anchor);
  execute definition;
end
$patch$;

commit;

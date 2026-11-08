-- 글쓰기(post) 포인트의 최소 글자 수 조건을 없앤다(사용자 결정 2026-11-09 01:55: "20자 아니어도 그냥 줘").
-- 활성 정책 v1의 rules는 dukjil_policy_guard가 고칠 수 없게 막으므로(DUKJIL_POLICY_IMMUTABLE) 정책 행은 그대로 두고,
-- record_dukjil_action이 post에서만 minChars를 읽지 않게 한다. 하루 3회(pointCap), 같은 글 재지급 방지(source/request 키),
-- 같은 본문 7일(sameBodyDays) 규칙과 다른 행동(comment 5자)의 minChars는 그대로다.
-- 현재 정의를 읽어 한 줄만 바꾸므로 소유자·권한은 유지된다. 이미 바뀐 정의면 아무것도 하지 않는다.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(sig);
  original constant text := $a$  if (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
  patched constant text := $a$  -- 20261219020000: post pays at any length; the other actions keep their policy minChars.
  if p_action_key <> 'post' and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
  hits integer;
begin
  if pg_catalog.strpos(definition, patched) > 0 then return; end if;
  hits := (pg_catalog.length(definition) - pg_catalog.length(pg_catalog.replace(definition, original, ''))) / pg_catalog.length(original);
  if hits <> 1 then
    raise exception 'record_dukjil_action minChars line found % times (expected 1)', hits;
  end if;
  execute pg_catalog.replace(definition, original, patched);
end
$patch$;

commit;

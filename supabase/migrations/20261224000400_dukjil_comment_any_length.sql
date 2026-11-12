-- 댓글(comment) 포인트의 최소 글자 수 조건을 없앤다(사용자 결정 2026-11-12 14:33: "댓글 짧아도 포인트 주라니까").
-- 팬게시판 댓글·아티스트 소식 댓글·그룹 게시판 댓글 모두 같은 record_dukjil_action('comment')으로 지급하므로 한 곳만 바꾼다.
-- 활성 정책 v1의 rules는 dukjil_policy_guard가 고칠 수 없게 막으므로(DUKJIL_POLICY_IMMUTABLE) 정책 행(comment.minChars 5)은 그대로 두고,
-- 20261219020000이 post에 한 것처럼 record_dukjil_action이 comment에서도 minChars를 읽지 않게 한다.
-- 남용 방지는 그대로다: 하루 10회(pointCap), 같은 글·소식에 한 번(oncePerTarget), 같은 댓글 재지급 방지(source/request 키),
-- 패스포트 조건. 빈 댓글·공백만인 댓글은 등록 자체가 거절되므로(본문 1자 이상) 지급 경로에 오지 않는다.
-- 현재 정의를 읽어 한 줄만 바꾸므로 소유자·권한은 유지된다. 이미 바뀐 정의면 아무것도 하지 않는다.
-- Rollback: supabase/rollback/20261224000400_dukjil_comment_any_length.sql.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(sig);
  original constant text := $a$  if p_action_key <> 'post' and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
  patched constant text := $a$  -- 20261224000400: a comment pays at any length too.
  if p_action_key not in ('post', 'comment') and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
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

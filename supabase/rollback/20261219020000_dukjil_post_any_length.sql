-- Rollback of 20261219020000_dukjil_post_any_length.sql: post again needs the policy minChars (v1: 20자).
-- Points already paid to short posts stay (the action log and ledger are append-only).
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(sig);
  original constant text := $a$  if (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
  patched constant text := $a$  -- 20261219020000: post pays at any length; the other actions keep their policy minChars.
  if p_action_key <> 'post' and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$a$;
begin
  if pg_catalog.strpos(definition, patched) = 0 then return; end if;
  execute pg_catalog.replace(definition, patched, original);
end
$patch$;

commit;

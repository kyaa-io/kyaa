-- ORDER: roll the web back first, then THIS file, then 20261224000400's rollback, then (if B3 is rolled back) the B3 files' rollbacks.
-- Rollback of 20261224030000_dukjil_comment_any_length_b3_pair.sql: back to the state 20261224000400 left. The B3 pairs are reverted (md5 =
-- base checked), pair 11 is removed, pairs 1 to 10 apply again, and the line is written back exactly as 20261224000400 wrote it (without
-- the marker), so that rollback finds its text. A comment still pays at any length until 20261224000400's rollback runs.
begin;
set local lock_timeout = '5s';
do $$
declare
  v_fn constant text := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
  original constant text := $o$  if p_action_key <> 'post' and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$o$;
  unmarked constant text := $u$  -- 20261224000400: a comment pays at any length too.
  if p_action_key not in ('post', 'comment') and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$u$;
  f record;
begin
  if not exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 11) then return; end if;
  perform public.b3_patch_function(v_fn, true);
  delete from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 11;
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'COMMENT_LENGTH_PAIR_ROLLBACK_FAILED'; end if;
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = v_fn::regprocedure;
  if public.b3_patch_count(f.prosrc, original) <> 1 then raise exception 'COMMENT_LENGTH_GUARD_CHANGED'; end if;
  execute pg_catalog.replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, pg_catalog.replace(f.prosrc, original, unmarked));
end $$;
commit;

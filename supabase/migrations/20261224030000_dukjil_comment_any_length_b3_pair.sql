-- The comment-at-any-length rule (20261224000400) as B3 text pair 11 of record_dukjil_action.
--
-- record_dukjil_action carries B3 text pairs 1 to 10 (20261220031000). Their rollback reverts the pairs and then requires
-- md5(prosrc) to equal the recorded base (b3_function_patch_bases, 809df1c25a8edfc755acd3fccde4c030). 20261224000400 replaced
--   if p_action_key <> 'post' and (rule -> 'minChars') ...
-- with the same line that also skips minChars for 'comment' outside that bookkeeping, so the B3 rollback reverted pairs 1 to 10, kept
-- the changed line and stopped with B3_PATCH_BASE_CHANGED. 20261224000400 is applied and is not edited. This file moves its text into
-- the bookkeeping the same way 20261222130000 did for the fan-board video limit:
--   1. the changed line goes back to the original line (the exact inverse of 20261224000400's replace, count checked);
--   2. b3_patch_function reverts pairs 1 to 10 and checks md5 = base (the base is unchanged);
--   3. pair 11 (original line -> line with the 'comment' exception + marker) is recorded; 4. pairs 1 to 11 apply again.
-- The resulting body is 20261224000400's line with the marker /* b3-comment-any-length */ in place of its "--" comment line, so a comment
-- pays at any length exactly as before, and the B3 rollback now reverts all eleven pairs back to the base. Owner, security, settings and
-- grants are compared by b3_patch_function. Already holding pair 11 (this file or an earlier copy of it ran): nothing to do.
-- Holding the base line (20261224000400 not applied, or a B3 rollback and re-apply happened after it): step 3 and 4 add the rule.
-- Rollback: supabase/rollback/20261224030000_dukjil_comment_any_length_b3_pair.sql (run it before 20261224000400's rollback).
begin;
set local lock_timeout = '5s';
do $$
declare
  v_fn constant text := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
  original constant text := $o$  if p_action_key <> 'post' and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$o$;
  unmarked constant text := $u$  -- 20261224000400: a comment pays at any length too.
  if p_action_key not in ('post', 'comment') and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$u$;
  patched constant text := $p$  /* b3-comment-any-length */ if p_action_key not in ('post', 'comment') and (rule -> 'minChars') is not null and coalesce((params ->> 'chars')::integer, 0) < (rule ->> 'minChars')::integer then$p$;
  f record;
begin
  if exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 11) then
    if public.b3_patch_function(v_fn, false) <> 'unchanged' then raise exception 'COMMENT_LENGTH_PAIR_NOT_APPLIED'; end if;
    return;
  end if;
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = v_fn::regprocedure;
  if public.b3_patch_count(f.prosrc, patched) <> 0 then raise exception 'COMMENT_LENGTH_GUARD_CHANGED: marker without pair 11'; end if;
  if public.b3_patch_count(f.prosrc, unmarked) = 1 and public.b3_patch_count(f.prosrc, original) = 0 then
    execute pg_catalog.replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, pg_catalog.replace(f.prosrc, unmarked, original));
  elsif not (public.b3_patch_count(f.prosrc, unmarked) = 0 and public.b3_patch_count(f.prosrc, original) = 1) then
    raise exception 'COMMENT_LENGTH_GUARD_CHANGED';
  end if;
  perform public.b3_patch_function(v_fn, true);
  insert into public.b3_function_patches (fn, pair_no, original, patched) values (v_fn, 11, original, patched);
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'COMMENT_LENGTH_PAIR_NOT_APPLIED'; end if;
end $$;
commit;

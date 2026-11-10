-- The fan-board video limit (20261221170000) as a B3 text pair of reserve_owned_mobile_media.
--
-- reserve_owned_mobile_media carries B3 text pairs (20261220033000: share_proof purpose, pairs 1 and 2) whose rollback reverts them and
-- then requires md5(prosrc) to equal the recorded base (b3_function_patch_bases). 20261221170000 replaced
--   p_byte_size not between 1 and 52428800
-- with the per-purpose CASE (200 MiB for fan-post videos, 50 MiB otherwise) outside that bookkeeping, so the B3 rollback reverted pairs 1
-- and 2, kept the CASE, and stopped with B3_PATCH_BASE_CHANGED. 20261221170000 is applied on dev and is not edited; this file moves its
-- text into the bookkeeping the same way 20261221140000 added share-tag pairs:
--   1. the CASE text goes back to the 50 MiB text (the exact inverse of 20261221170000's replace, count checked), giving the B3 body;
--   2. b3_patch_function reverts pairs 1 and 2 and checks md5 = base (unchanged base 7eb68e9349894d457a6335f8f8351bee);
--   3. pair 3 (50 MiB text -> CASE text + marker) is recorded; 4. pairs 1, 2, 3 apply again (owner, security, settings, grants compared).
-- The resulting body is the CASE text 20261221170000 wrote plus the marker ' /* b3-fan-video-limit */' right after it, so the boundary is
-- the same and the B3 rollback now reverts all three pairs back to the base.
-- Already holding pair 3 applied: nothing to do. Holding pairs 1 and 2 with the 50 MiB text (a B3 rollback and re-apply happened after
-- 20261221170000): steps 2 to 4 restore the 200 MiB fan-post video limit.
-- Rollback: supabase/rollback/20261222130000_fan_board_video_limit_b3_pair.sql (run it before 20261221170000's rollback).
begin;
set local lock_timeout = '5s';
do $$
declare
  v_fn constant text := 'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)';
  narrow constant text := 'p_byte_size not between 1 and 52428800';
  wide constant text := 'p_byte_size not between 1 and (case when p_purpose=''fan_post'' and p_kind=''video'' then 209715200 else 52428800 end)';
  marked constant text := wide || ' /* b3-fan-video-limit */';
  f record;
begin
  if exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 3) then
    if public.b3_patch_function(v_fn, false) <> 'unchanged' then raise exception 'FAN_BOARD_SIZE_PAIR_NOT_APPLIED'; end if;
    return;
  end if;
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = v_fn::regprocedure;
  if public.b3_patch_count(f.prosrc, marked) <> 0 then raise exception 'FAN_BOARD_SIZE_GUARD_CHANGED: marker without pair 3'; end if;
  if public.b3_patch_count(f.prosrc, wide) = 1 and public.b3_patch_count(f.prosrc, narrow) = 0 then
    execute pg_catalog.replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, pg_catalog.replace(f.prosrc, wide, narrow));
  elsif not (public.b3_patch_count(f.prosrc, wide) = 0 and public.b3_patch_count(f.prosrc, narrow) = 1) then
    raise exception 'FAN_BOARD_SIZE_GUARD_CHANGED';
  end if;
  perform public.b3_patch_function(v_fn, true);
  insert into public.b3_function_patches (fn, pair_no, original, patched) values (v_fn, 3, narrow, marked);
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'FAN_BOARD_SIZE_PAIR_NOT_APPLIED'; end if;
end $$;
commit;

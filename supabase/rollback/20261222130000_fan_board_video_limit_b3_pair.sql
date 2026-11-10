-- ORDER: roll the web back first, then THIS file, then 20261221171000's rollback, then 20261221170000's rollback.
-- Rollback of 20261222130000_fan_board_video_limit_b3_pair.sql: back to the state 20261221170000 left. The B3 pairs are reverted (md5 = base
-- checked), pair 3 is removed, pairs 1 and 2 apply again, and the CASE text is written back without the marker. The 200 MiB fan-post video
-- limit stays (20261221170000's rollback removes it), and that rollback finds its CASE text exactly as it wrote it.
begin;
set local lock_timeout = '5s';
do $$
declare
  v_fn constant text := 'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)';
  narrow constant text := 'p_byte_size not between 1 and 52428800';
  wide constant text := 'p_byte_size not between 1 and (case when p_purpose=''fan_post'' and p_kind=''video'' then 209715200 else 52428800 end)';
  f record;
begin
  if not exists (select 1 from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 3) then return; end if;
  perform public.b3_patch_function(v_fn, true);
  delete from public.b3_function_patches p where p.fn = v_fn and p.pair_no = 3;
  if public.b3_patch_function(v_fn, false) <> 'applied' then raise exception 'FAN_BOARD_SIZE_PAIR_ROLLBACK_FAILED'; end if;
  select oid, prosrc into strict f from pg_catalog.pg_proc where oid = v_fn::regprocedure;
  if public.b3_patch_count(f.prosrc, narrow) <> 1 then raise exception 'FAN_BOARD_SIZE_GUARD_CHANGED'; end if;
  execute pg_catalog.replace(pg_catalog.pg_get_functiondef(f.oid), f.prosrc, pg_catalog.replace(f.prosrc, narrow, wide));
end $$;
commit;

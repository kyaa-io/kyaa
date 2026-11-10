-- ORDER: roll the web back first, then 20261222130000_fan_board_video_limit_b3_pair.sql, then THIS file, then supabase/rollback/20261221170000_fan_board_video_limit.sql (the S3 ceiling goes before the DB reservation limit).
-- BOUNDARY: reserve_s3_storage_object is a low-level service function; for 'mobile-media' it only knows the bucket ceiling and does not check the purpose.
-- The user-facing boundary is reserve_owned_mobile_media (200 MiB for fan-post videos, 50 MiB for every other purpose) plus the exact ContentLength the signed PUT carries.
-- Rollback of 20261221171000: the bucket limit alone decides again (50 MiB on AWS). Roll the web back first; refuses while a larger mobile-media object is reserved.
begin;
set local lock_timeout = '5s';
do $$
declare f record; new_text text := 'p_size>(case when p_bucket=''mobile-media'' then greatest(coalesce(b.file_size_limit,52428800),209715200) else coalesce(b.file_size_limit,52428800) end)'; next_body text;
begin
  if to_regclass('public.s3_storage_objects') is not null and exists (select 1 from public.s3_storage_objects where bucket_id = 'mobile-media' and coalesce((metadata ->> 'size')::bigint, 0) > 52428800) then
    raise exception 'FAN_BOARD_S3_LIMIT_ROLLBACK_BLOCKED: mobile-media objects above 50 MiB exist';
  end if;
  select oid, prosrc into strict f from pg_proc where oid = 'public.reserve_s3_storage_object(text,text,text,bigint,text)'::regprocedure;
  if position(new_text in f.prosrc) = 0 then return; end if;
  next_body := replace(f.prosrc, new_text, 'p_size>coalesce(b.file_size_limit,52428800)');
  execute replace(pg_get_functiondef(f.oid), f.prosrc, next_body);
end $$;
commit;

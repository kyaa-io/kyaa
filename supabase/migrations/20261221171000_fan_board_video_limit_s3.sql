-- Fan-board videos up to 200 MiB on the AWS (S3) storage path. 20261221170000 raised the DB reservation limit, but the S3 reservation
-- (reserve_s3_storage_object, reached through reserve_s3_mobile_upload) still compares the size with storage.buckets.file_size_limit, which is
-- sealed read-only on the AWS databases at 50 MiB. Only the 'mobile-media' bucket gets the 200 MiB ceiling here; the per-purpose limit
-- (200 MiB for fan-post videos, 50 MiB for every other purpose) stays in reserve_owned_mobile_media and the asset's expected_byte_size check.
-- The CASE is parenthesised because plpgsql ends an IF condition at the first THEN outside parentheses.
-- Rollback: supabase/rollback/20261221171000_fan_board_video_limit_s3.sql
begin;
set local lock_timeout = '5s';
do $$
declare f record; old text := 'p_size>coalesce(b.file_size_limit,52428800)'; next_body text;
  new_text text := 'p_size>(case when p_bucket=''mobile-media'' then greatest(coalesce(b.file_size_limit,52428800),209715200) else coalesce(b.file_size_limit,52428800) end)';
begin
  select oid, prosrc into strict f from pg_proc where oid = 'public.reserve_s3_storage_object(text,text,text,bigint,text)'::regprocedure;
  if position(new_text in f.prosrc) > 0 then return; end if;
  if (length(f.prosrc) - length(replace(f.prosrc, old, ''))) / length(old) <> 1 then raise exception 'FAN_BOARD_S3_SIZE_GUARD_CHANGED'; end if;
  next_body := replace(f.prosrc, old, new_text);
  execute replace(pg_get_functiondef(f.oid), f.prosrc, next_body);
end $$;
notify pgrst, 'reload schema';
commit;

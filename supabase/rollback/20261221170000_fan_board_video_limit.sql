-- Rollback of 20261221170000_fan_board_video_limit.sql: the 50 MiB ceiling again for every purpose.
-- Roll the web back first. Refuses while a fan-post video above 50 MiB exists (the old check would reject it).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.mobile_media_assets where expected_byte_size > 52428800) then
    raise exception 'FAN_BOARD_VIDEO_LIMIT_ROLLBACK_BLOCKED: assets above 50 MiB exist';
  end if;
end $$;
alter table public.mobile_media_assets drop constraint mobile_media_assets_expected_byte_size_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_expected_byte_size_check check (expected_byte_size between 1 and 52428800);
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  if exists (select 1 from pg_trigger x where x.tgrelid = 'storage.buckets'::regclass and not x.tgisinternal and x.tgfoid = to_regproc('storage.byus_reject_metadata_mutation')) then return; end if;
  update storage.buckets set file_size_limit = 52428800 where id = 'mobile-media';
end $$;
do $$
declare f record; old text := 'p_byte_size not between 1 and (case when p_purpose=''fan_post'' and p_kind=''video'' then 209715200 else 52428800 end)'; next_body text;
begin
  select oid, prosrc into strict f from pg_proc where oid = 'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'::regprocedure;
  if position(old in f.prosrc) = 0 then return; end if;
  next_body := replace(f.prosrc, old, 'p_byte_size not between 1 and 52428800');
  execute replace(pg_get_functiondef(f.oid), f.prosrc, next_body);
end $$;
commit;

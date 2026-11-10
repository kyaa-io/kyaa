-- Keep the larger allowance exclusive to fan board videos at every reservation boundary.
alter table public.mobile_media_assets drop constraint mobile_media_assets_expected_byte_size_check;
alter table public.mobile_media_assets add constraint mobile_media_assets_expected_byte_size_check
  check (expected_byte_size between 1 and case when purpose='fan_post' and kind='video' then 209715200 else 52428800 end);
-- The bucket limit is a Supabase Storage setting. Where the legacy storage metadata is sealed (the AWS databases), the ceiling lives in the
-- signed upload and the app instead and the table rejects writes, so this step is skipped there.
do $$ begin
  if to_regclass('storage.buckets') is null then return; end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'storage.buckets'::regclass and not t.tgisinternal and t.tgfoid = to_regproc('storage.byus_reject_metadata_mutation')) then return; end if;
  update storage.buckets set file_size_limit = 209715200 where id = 'mobile-media';
end $$;
do $$
declare f record; old text := 'p_byte_size not between 1 and 52428800'; next_body text;
begin
 select oid, prosrc into strict f from pg_proc where oid='public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'::regprocedure;
 if (length(f.prosrc)-length(replace(f.prosrc,old,'')))/length(old) <> 1 then raise exception 'FAN_BOARD_SIZE_GUARD_CHANGED'; end if;
 next_body := replace(f.prosrc,old,'p_byte_size not between 1 and (case when p_purpose=''fan_post'' and p_kind=''video'' then 209715200 else 52428800 end)');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,next_body);
end $$;

do $$ begin
  if to_regclass('public.mobile_media_assets') is null or to_regclass('public.mobile_media_validation_jobs') is null then raise exception 'mobile media tables missing'; end if;
  if to_regprocedure('public.send_social_dm_message(uuid,uuid,text,uuid,uuid)') is null then raise exception 'media DM overload missing'; end if;
  if not exists(select 1 from storage.buckets where id='mobile-media' and public=false and file_size_limit=52428800) then raise exception 'private media bucket contract missing'; end if;
end $$;

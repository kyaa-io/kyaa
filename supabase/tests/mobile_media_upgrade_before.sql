do $$ begin
  if to_regclass('public.mobile_media_assets') is not null then raise exception 'mobile media unexpectedly exists before upgrade'; end if;
  if to_regprocedure('public.send_social_dm_message(uuid,uuid,text,uuid)') is null then raise exception 'text DM baseline missing'; end if;
end $$;

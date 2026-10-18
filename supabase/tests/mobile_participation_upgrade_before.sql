do $$ begin
  if to_regclass('public.mobile_participation_events') is not null then raise exception 'mobile participation tables unexpectedly exist before upgrade'; end if;
  if to_regprocedure('public.reserve_owned_live_event(uuid,uuid,uuid,uuid,text,text)') is null then raise exception 'existing LIVE baseline missing'; end if;
  if to_regprocedure('public.authorize_mobile_media_read(uuid,uuid,text)') is null then raise exception 'mobile media baseline missing'; end if;
end $$;

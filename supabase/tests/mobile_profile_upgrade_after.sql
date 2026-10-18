do $$ begin
  if not exists(select 1 from public.app_users where id='78000000-0000-4000-8000-000000000001') then raise exception 'upgrade lost existing user'; end if;
  if to_regprocedure('public.read_owned_mobile_profile(uuid,public.content_locale)') is null
    or to_regprocedure('public.read_owned_mobile_profile_activities(uuid,public.content_locale,text,timestamp with time zone,uuid,text,integer)') is null
    then raise exception 'mobile profile RPCs missing after upgrade'; end if;
end $$;

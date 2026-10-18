do $$ begin
  if not exists(select 1 from public.app_users where id='70000000-0000-4000-8000-000000000001') then raise exception 'social migration lost an existing account'; end if;
  if public.read_owned_social_settings('70000000-0000-4000-8000-000000000001')<>jsonb_build_object('profileVisible',false,'favoriteSlugs','[]'::jsonb,'dmPolicy','friends') then raise exception 'existing account did not receive private social defaults'; end if;
  if has_table_privilege('service_role','public.social_profile_settings','SELECT') then raise exception 'social table leaked direct service access'; end if;
end $$;

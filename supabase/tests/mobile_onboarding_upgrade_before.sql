do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Account onboarding upgrade fixture requires disposable local byus_clean';
  end if;
end $$;
insert into public.app_users(id,privy_user_id,verified_email)
values('af040000-0000-4000-8000-000000000099','did:privy:before-account-passport','before-account-passport@example.invalid');
select public.set_owned_user_nickname('af040000-0000-4000-8000-000000000099','Before Passport');

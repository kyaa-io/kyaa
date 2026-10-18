do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Mobile default passport upgrade tests require disposable local byus_clean';
  end if;
end $$;
insert into public.app_users(id,privy_user_id,verified_email,status,created_at) values
  ('7d110000-0000-4000-8000-000000000001','did:privy:default-upgrade-active','default-upgrade-active@example.test','active','2026-08-01T01:02:03Z'),
  ('7d110000-0000-4000-8000-000000000002','did:privy:default-upgrade-disabled','default-upgrade-disabled@example.test','disabled','2026-08-02T01:02:03Z');
create table public.mobile_default_passport_upgrade_snapshot as
select count(*) invite_stamp_count from public.community_stamps where kind='invite';

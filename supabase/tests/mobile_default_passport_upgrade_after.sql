do $$ declare snapshot record;active_id uuid;new_user constant uuid:='7d110000-0000-4000-8000-000000000003'; begin
  select * into strict snapshot from public.mobile_default_passport_upgrade_snapshot;
  select id into strict active_id from public.mobile_default_passports
    where app_user_id='7d110000-0000-4000-8000-000000000001';
  if (select issued_at from public.mobile_default_passports where id=active_id)<>'2026-08-01T01:02:03Z'::timestamptz
    or exists(select 1 from public.mobile_default_passports where app_user_id='7d110000-0000-4000-8000-000000000002') then
    raise exception 'upgrade backfill did not preserve active account creation or exclude disabled accounts';
  end if;
  if (select count(*) from public.community_stamps where kind='invite')<>snapshot.invite_stamp_count then
    raise exception 'default passport backfill created invitation rewards';
  end if;
  if exists(select 1 from public.community_stamp_share_links
    where include_nickname is null or include_public_stamps is null) then
    raise exception 'upgrade left share visibility undefined';
  end if;
  insert into public.app_users(id,privy_user_id,verified_email,created_at)
    values(new_user,'did:privy:default-upgrade-new','default-upgrade-new@example.test','2026-08-03T01:02:03Z');
  if (select count(*) from public.mobile_default_passports where app_user_id=new_user)<>1
    or public.ensure_mobile_default_passport(new_user) is distinct from
      (select id from public.mobile_default_passports where app_user_id=new_user) then
    raise exception 'post-upgrade signup did not provision idempotently';
  end if;
end $$;

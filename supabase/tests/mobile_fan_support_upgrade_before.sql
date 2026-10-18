-- Disposable upgrade fixtures only; never production policy activation.
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
create table public.heart_support_upgrade_snapshot(owner uuid primary key,wallet jsonb);
do $$declare u uuid;creator uuid:='e8000000-0000-4000-8000-000000000010';policy uuid;admin_id uuid:=extensions.gen_random_uuid();adjustment uuid:=extensions.gen_random_uuid();rules jsonb;begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'heart-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select creator,locale,'Heart fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(creator,'heart-v1','exchange','{"support_voucher":100,"free_vote":10,"free_draw":20,"maxUnits":1000}',clock_timestamp())returning id into policy;
 for n in 1..3 loop
  u:=('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:heart-'||n,'heart-'||n||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'heartfan'||n,'heartfan'||n);
  insert into public.social_profile_settings(app_user_id,profile_visible)values(u,n<>3);
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(u,creator,true);
  perform public.mobile_fan_economy_post(u,creator,'fan_point',case n when 1 then 99 when 2 then 100 else 250 end,'fixture',extensions.gen_random_uuid(),policy);
  insert into public.heart_support_upgrade_snapshot values(u,public.read_owned_mobile_fan_economy_wallet(u,'heart-fixture'));
 end loop;
 u:='e8000000-0000-4000-8000-000000000003';
 perform public.post_fan_ticket_entry(u,creator,'credit',5,'fan_point_exchange',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select policy_version from public.reward_policy_activation where singleton),null,null);
 update public.heart_support_upgrade_snapshot set wallet=public.read_owned_mobile_fan_economy_wallet(u,'heart-fixture')where owner=u;
 insert into public.admin_allowlist(id,email,role,active)values(admin_id,'heart-3@example.test','admin',true);
 insert into public.fan_score_adjustments(id,app_user_id,celebrity_id,points,reason,idempotency_key,actor_app_user_id,actor_admin_allowlist_id,correlation_id,resulting_score)values(adjustment,u,creator,7,'Existing heart fixture XP',extensions.gen_random_uuid(),u,admin_id,extensions.gen_random_uuid(),7);
 insert into public.fan_score_ledger(app_user_id,celebrity_id,points,adjustment_id)values(u,creator,7,adjustment);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values('e8000000-0000-4000-8000-000000000002',91342,'0xe800000000000000000000000000000000000002','privy','embedded');
 select jsonb_object_agg(action,case when action='checkin'then 100 else 0 end)into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'])action;
 perform public.activate_mobile_fan_earning(creator,'heart-earning-fixture',rules);
end $$;

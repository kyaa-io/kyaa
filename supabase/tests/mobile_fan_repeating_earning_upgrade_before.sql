do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
create table public.repeating_earning_upgrade_snapshot(wallet jsonb,missions jsonb);
insert into public.app_users(id,privy_user_id,verified_email)values
 ('ea000000-0000-4000-8000-000000000001','did:privy:earning-owner','earning-owner@example.test'),
 ('ea000000-0000-4000-8000-000000000002','did:privy:earning-author','earning-author@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values('ea000000-0000-4000-8000-000000000010','earning-fixture','published','/fixture.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select 'ea000000-0000-4000-8000-000000000010',locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible)values('ea000000-0000-4000-8000-000000000020','ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000002','Before activation',extensions.gen_random_uuid(),repeat('a',64),false);
insert into public.fan_post_likes(post_id,app_user_id)values('ea000000-0000-4000-8000-000000000020','ea000000-0000-4000-8000-000000000001');
do $$declare rules jsonb;begin
 select jsonb_object_agg(k,case when k='checkin'then 100 else 0 end)into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'])k;
 perform public.activate_mobile_fan_earning('ea000000-0000-4000-8000-000000000010','earning-old',rules);
end $$;
insert into public.repeating_earning_upgrade_snapshot select public.read_owned_mobile_fan_economy_wallet('ea000000-0000-4000-8000-000000000001','earning-fixture'),public.read_owned_mobile_fan_economy_missions('ea000000-0000-4000-8000-000000000001','earning-fixture');

-- Real legacy ticket entitlements before306; invitation ordinals are account-global.
create table public.repeating_earning_legacy_invite_snapshot(app_user_id uuid primary key,max_ordinal integer,ticket_balance bigint,ticket_entries jsonb,milestones jsonb);
do $$declare creator uuid:='ea000000-0000-4000-8000-000000000011';u uuid;maximum integer;begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'earning-legacy','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select creator,locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
 insert into public.community_stamp_invitation_reward_configs(invitation_policy_version,config_version,celebrity_id,ticket_amount,reward_policy_version,effective_at)values(1,8999,creator,1,2,clock_timestamp());
 foreach maximum in array array[3,5]loop
 u:=('ea000000-0000-4000-8000-'||lpad(maximum::text,12,'0'))::uuid;
 insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:earning-legacy-'||maximum,'earning-legacy-'||maximum||'@example.test');
 for n in 1..maximum loop
 insert into public.community_stamp_invitation_milestones(inviter_app_user_id,invitation_policy_version,milestone_number,qualified_count,created_at)values(u,1,n,n*10,clock_timestamp());
 perform public.process_community_stamp_invitation_milestone(u,n);
 end loop;
 insert into public.repeating_earning_legacy_invite_snapshot select u,maximum,public.get_fan_ticket_balance(u,creator),
 (select jsonb_agg(to_jsonb(l)order by l.id)from public.fan_ticket_ledger l where l.app_user_id=u),
 (select jsonb_agg(to_jsonb(m)order by m.id)from public.community_stamp_invitation_milestones m where m.inviter_app_user_id=u);
 end loop;
end $$;

commit;

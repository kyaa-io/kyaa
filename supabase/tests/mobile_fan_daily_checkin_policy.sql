-- Local-only policy example; this is not an activation migration.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$
declare owner uuid:='e7000000-0000-4000-8000-000000000001';creator uuid:='e7000000-0000-4000-8000-000000000002';admin_id uuid:=extensions.gen_random_uuid();adjustment uuid:=extensions.gen_random_uuid();rules jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:daily-checkin-policy','daily-checkin-policy@example.test');
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(owner,91342,'0xe700000000000000000000000000000000000001','privy','embedded');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'daily-checkin-policy','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select creator,locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
 insert into public.admin_allowlist(id,email,role,active)values(admin_id,'daily-checkin-policy@example.test','admin',true);
 insert into public.fan_score_adjustments(id,app_user_id,celebrity_id,points,reason,idempotency_key,actor_app_user_id,actor_admin_allowlist_id,correlation_id,resulting_score)values(adjustment,owner,creator,7,'Existing local fixture XP',extensions.gen_random_uuid(),owner,admin_id,extensions.gen_random_uuid(),7);
 insert into public.fan_score_ledger(app_user_id,celebrity_id,points,adjustment_id)values(owner,creator,7,adjustment);
 insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values(creator,true);
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible)values(owner,creator,'Before local activation',extensions.gen_random_uuid(),'fixture',true);
 if public.get_fan_ticket_balance(owner,creator)<>1 then raise exception 'Existing legacy ticket fixture missing';end if;
 select jsonb_object_agg(action,case when action='checkin' then 100 else 0 end)into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'])action;
 perform public.activate_mobile_fan_earning(creator,'daily-checkin-fixture-v1',rules);
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(creator,'daily-checkin-exchange-fixture-v1','exchange','{"free_draw":100}',clock_timestamp());
end $$;
commit;
-- Canonical source timestamps must be after activation, as on separate real requests.
begin;
do $$
declare owner uuid:='e7000000-0000-4000-8000-000000000001';creator uuid:='e7000000-0000-4000-8000-000000000002';request uuid:=extensions.gen_random_uuid();answer jsonb;replay jsonb;
begin
 if public.check_in_community_stamp(owner,'daily-checkin-policy')->>'awarded'<>'true' then raise exception 'First daily checkin missing';end if;
 if public.check_in_community_stamp(owner,'daily-checkin-policy')->>'awarded'<>'false' then raise exception 'Same KST day checkin duplicated';end if;
 if public.mobile_fan_economy_balance(owner,creator,'fan_point')<>100 or (select count(*)from public.mobile_fan_economy_activity_receipts where app_user_id=owner and celebrity_id=creator and action_key='checkin' and scope_key=public.community_stamp_kst_date()::text)<>1 then raise exception 'Daily checkin must award exactly one 100P receipt';end if;
 answer:=public.exchange_owned_mobile_fan_economy(owner,request,'daily-checkin-policy','free_draw','daily-checkin-exchange-fixture-v1',1);
 replay:=public.exchange_owned_mobile_fan_economy(owner,request,'daily-checkin-policy','free_draw','daily-checkin-exchange-fixture-v1',1);
 if (answer-'replayed') is distinct from (replay-'replayed') or replay->>'replayed'<>'true' or public.mobile_fan_economy_balance(owner,creator,'fan_point')<>0 or public.get_fan_ticket_balance(owner,creator)<>2 then raise exception '100P exchange mismatch answer=% replay=% points=% tickets=%',answer,replay,public.mobile_fan_economy_balance(owner,creator,'fan_point'),public.get_fan_ticket_balance(owner,creator);end if;
 if(select sum(points)from public.fan_score_ledger where app_user_id=owner and celebrity_id=creator)<>7 then raise exception 'Existing XP changed';end if;
 begin perform public.exchange_owned_mobile_fan_economy(owner,extensions.gen_random_uuid(),'daily-checkin-policy','free_vote','daily-checkin-exchange-fixture-v1',1);raise exception 'Unconfigured exchange allowed';exception when others then if sqlerrm not like '%POLICY_UNCONFIGURED%'then raise;end if;end;
 raise notice 'PASS local-only daily checkin once per KST day, 100P to one free draw, replay once, legacy ticket and XP7 retained, other exchange unconfigured';
end $$;
rollback;

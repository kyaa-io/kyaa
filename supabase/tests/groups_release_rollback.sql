-- Disposable fixture only: no production ledger writes.
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end $$;
begin;
do $$declare actor uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();rules jsonb;policy uuid;result jsonb;prior jsonb;today date:=public.community_stamp_kst_date();begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:rollback-'||actor,actor||'@example.test');
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(actor,91342,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa990011','privy','embedded');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'groups-rollback-fixture','published','/fixture.webp',now(),'{creator}','creator');
 select jsonb_object_agg(action,10)into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'])action;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(creator,'rollback-fixture','earning',rules,now()-interval'1 day')returning id into policy;
 insert into public.mobile_fan_earning_cutovers(celebrity_id,version,policy_id,effective_at)values(creator,'rollback-fixture',policy,now()-interval'1 day');
 update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=today;
 perform public.check_in_community_stamp(actor,'groups-rollback-fixture');
 if public.group_wallet_balance(actor,'fan_point')<>0 then raise exception 'global start did not suppress creator reward';end if;
 update public.group_wallet_release set rewards_start_on='infinity'::date;
 begin perform public.check_in_owned_group_wallet(actor,gen_random_uuid());raise exception 'new global checkin accepted while deferred';exception when others then if sqlerrm<>'GROUP_WALLET_REWARDS_NOT_STARTED'then raise;end if;end;
 result:=public.award_mobile_fan_activity(actor,creator,'checkin',today::text);
 if result->>'status'<>'awarded'or result->>'amount'<>'10'then raise exception 'legacy checkin failed after deferred start: %',result;end if;
 prior:=result;result:=public.award_mobile_fan_activity(actor,creator,'checkin',today::text);
 if result<>prior or public.group_wallet_balance(actor,'fan_point')<>10 then raise exception 'legacy replay changed receipt/balance';end if;
 if exists(select 1 from public.group_wallet_receipts where app_user_id=actor)or exists(select 1 from public.group_wallet_attendance where app_user_id=actor)then raise exception 'deferred global reward wrote a receipt';end if;
 if not(select enabled and not write_fenced and migration_evidence_sha256=repeat('a',64)from public.group_wallet_release where singleton)then raise exception 'rollback altered financial activation';end if;
end $$;
rollback;

-- Disposable production-order upgrade fixture. Never run against a remote DB.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;
 if to_regclass('public.mobile_fan_economy_ledger') is not null then raise exception 'Pending native migrations already applied';end if;
end $$;
create schema upgrade_fixture;
create table upgrade_fixture.legacy_rights(snapshot jsonb not null);
do $$ declare
 u uuid:='f9500000-0000-4000-8000-000000000001';c uuid:='f9500000-0000-4000-8000-000000000010';
 q uuid:='f9500000-0000-4000-8000-000000000011';a uuid:='f9500000-0000-4000-8000-000000000012';
 pass uuid:='f9500000-0000-4000-8000-000000000013';passport uuid:='f9500000-0000-4000-8000-000000000014';
 job uuid:='f9500000-0000-4000-8000-000000000015';adm uuid:='f9500000-0000-4000-8000-000000000016';
 adjustment uuid:='f9500000-0000-4000-8000-000000000017';
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:history-upgrade','history-upgrade@example.test');
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(u,91342,'0xf950000000000000000000000000000000000001','privy','embedded');
 insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(c,'history-upgrade','draft','/fixture.webp','{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select c,locale,'Upgrade fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
 update public.celebrities set status='published',published_at=now()where id=c;
 insert into public.celebrity_quizzes(id,celebrity_id,version,status)values(q,c,1,'draft');
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)values(a,u,c,q,1,a,'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)values(pass,u,c,a);
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)values(job,'passport',passport,'byus:passport:v1:'||u||':history-upgrade',1,jsonb_build_object('recipient','0xf950000000000000000000000000000000000001','celebritySlug','history-upgrade','passportId','0x'||repeat('b',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(passport,u,c,pass,job);
 perform public.post_fan_ticket_entry(u,c,'credit',5,'history_upgrade_fixture',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select policy_version from public.reward_policy_activation where singleton),null,null);
 insert into public.admin_allowlist(id,email,role,active)values(adm,'history-upgrade@example.test','admin',true);
 insert into public.fan_score_adjustments(id,app_user_id,celebrity_id,points,reason,idempotency_key,actor_app_user_id,actor_admin_allowlist_id,correlation_id,resulting_score)values(adjustment,u,c,7,'Existing production-order fixture XP',extensions.gen_random_uuid(),u,adm,extensions.gen_random_uuid(),7);
 insert into public.fan_score_ledger(app_user_id,celebrity_id,points,adjustment_id)values(u,c,7,adjustment);
 insert into upgrade_fixture.legacy_rights select jsonb_build_object(
  'ticketBalance',public.get_fan_ticket_balance(u,c),'totalXp',(select coalesce(sum(points),0)from public.fan_score_ledger where app_user_id=u and celebrity_id=c),
  'tickets',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_ticket_ledger x where app_user_id=u and celebrity_id=c),
  'xp',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_score_ledger x where app_user_id=u and celebrity_id=c),
  'passports',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_passports x where app_user_id=u and celebrity_id=c),
  'quizPasses',(select jsonb_agg(to_jsonb(x)order by id)from public.quiz_passes x where app_user_id=u and celebrity_id=c),
  'jobs',(select jsonb_agg(to_jsonb(x)order by id)from public.blockchain_jobs x where id=job));
 raise notice 'PASS remote250 fixture: manual ticket5/XP7 plus canonical Passport automatic rights captured, totalTicket=% totalXP=%',public.get_fan_ticket_balance(u,c),(select sum(points)from public.fan_score_ledger where app_user_id=u and celebrity_id=c);
end $$;

do $$ declare
 u uuid:='f9500000-0000-4000-8000-000000000001';c uuid:='f9500000-0000-4000-8000-000000000010';
 actual jsonb;wallet jsonb;
begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;
 select jsonb_build_object(
  'ticketBalance',public.get_fan_ticket_balance(u,c),'totalXp',(select coalesce(sum(points),0)from public.fan_score_ledger where app_user_id=u and celebrity_id=c),
  'tickets',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_ticket_ledger x where app_user_id=u and celebrity_id=c),
  'xp',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_score_ledger x where app_user_id=u and celebrity_id=c),
  'passports',(select jsonb_agg(to_jsonb(x)order by id)from public.fan_passports x where app_user_id=u and celebrity_id=c),
  'quizPasses',(select jsonb_agg(to_jsonb(x)order by id)from public.quiz_passes x where app_user_id=u and celebrity_id=c),
  'jobs',(select jsonb_agg(to_jsonb(x)order by id)from public.blockchain_jobs x where id='f9500000-0000-4000-8000-000000000015'))into actual;
 if actual is distinct from(select snapshot from upgrade_fixture.legacy_rights)then raise exception 'Production-order upgrade changed original legacy rights: %',actual;end if;
 if not exists(select 1 from public.fan_ticket_ledger where app_user_id=u and celebrity_id=c and source_type='history_upgrade_fixture'and amount=5)or not exists(select 1 from public.fan_score_ledger where adjustment_id='f9500000-0000-4000-8000-000000000017'and points=7)then raise exception 'Existing manual grant changed';end if;
 wallet:=public.read_owned_mobile_fan_support_wallet(u,'history-upgrade');
 if wallet#>>'{policy,status}'<>'unconfigured' or wallet->>'fanPoints'<>'0' or wallet->>'supportVouchers'<>'0' or (wallet->>'freeDrawEntries')::bigint<>(actual->>'ticketBalance')::bigint then raise exception 'Unconfigured native wallet did not preserve free access/rights: %',wallet;end if;
 if exists(select 1 from public.mobile_fan_earning_cutovers where celebrity_id=c)or exists(select 1 from public.mobile_fan_economy_policies where celebrity_id=c)then raise exception 'Upgrade activated a point policy';end if;
 if has_table_privilege('service_role','public.mobile_fan_support_contributions','SELECT') or has_function_privilege('authenticated','public.send_owned_mobile_fan_support(uuid,uuid,text,text,integer)','EXECUTE') then raise exception 'Native support privilege boundary leaked';end if;
 raise notice 'PASS remote250→pending57: exact original ledger/XP/Passport/quiz/job preservation, unconfigured wallet/free rights and native ACL';
end $$;
\ir fan_action_producers.sql
\ir brand_fanpages.sql
\ir quiz_personal_letter.sql
\ir notice_official_authors.sql
\ir public_fan_avatars.sql
\ir community_stamps_behavior.sql
\ir mobile_fan_support_upgrade_before.sql
\ir mobile_fan_support.sql

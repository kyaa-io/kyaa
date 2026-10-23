-- All fixtures roll back; no network/provider call is made.
begin;
create function pg_temp.rmt_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label;end if;end $$;
create function pg_temp.rmt_error(q text,marker text) returns void language plpgsql as $$
begin execute q;raise exception 'expected %',marker;
exception when others then if sqlerrm='expected '||marker or position(marker in sqlerrm)=0 then raise;end if;end $$;
do $$
declare u uuid:=extensions.gen_random_uuid();v uuid:=extensions.gen_random_uuid();legacy uuid:=extensions.gen_random_uuid();
 k uuid:=extensions.gen_random_uuid();creator uuid;input jsonb;r jsonb;j jsonb;payload jsonb;old_token uuid;i integer;f text;role_name text;
begin
 foreach f in array array['submit_owned_runmusic_v3(uuid,jsonb)','claim_runmusic_telegram_delivery(uuid)',
  'begin_runmusic_telegram_delivery(uuid,uuid,text)','finish_runmusic_telegram_delivery(uuid,uuid,text,bigint,integer,text)'] loop
  foreach role_name in array array['anon','authenticated'] loop
   perform pg_temp.rmt_assert(not has_function_privilege(role_name,'public.'||f,'execute'),role_name||' denied '||f);
  end loop;
  perform pg_temp.rmt_assert(has_function_privilege('service_role','public.'||f,'execute'),'service RPC allowed');
 end loop;
 perform pg_temp.rmt_assert(not has_table_privilege('service_role','public.runmusic_telegram_deliveries','select,insert,update,delete'),'no direct outbox access');
 perform pg_temp.rmt_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.runmusic_telegram_deliveries'::regclass),'forced RLS');
 perform pg_temp.rmt_assert(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='runmusic_telegram_deliveries' and column_name in('email','ciphertext','masked','fingerprint','kakao_id')),'outbox reference only');
 insert into public.app_users(id,privy_user_id,verified_email) values
  (u,'did:privy:rmt-owner','old@example.invalid'),(v,'did:privy:rmt-other','other@example.invalid'),(legacy,'did:privy:rmt-legacy','legacy@example.invalid');
 select id into creator from public.celebrities where slug='runmusic';
 if creator is null then insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role)
  values('runmusic','published','/qa.webp',clock_timestamp(),'{creator}','creator')returning id into creator;end if;
 update public.runmusic_campaign set published=true,draw_id=null,results_published=false,
  registration_opens_at=clock_timestamp()-interval'3 hours',registration_closes_at=clock_timestamp()+interval'1 hour',
  event_starts_at=clock_timestamp()+interval'1 hour',event_ends_at=clock_timestamp()+interval'2 hours',entry_closes_at=clock_timestamp()+interval'1 hour';
 input:=jsonb_build_object('action','enter','requestKey',k,'ciphertext','cipher1','masked','te***','fingerprint',repeat('a',64));
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input||'{"email":"spoof@example.invalid"}'),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input||'{"requestKey":"bad"}'),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input||'{"ciphertext":null}'),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input||jsonb_build_object('ciphertext',repeat('x',1025))),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input),'RUNMUSIC_LIKE_REQUIRED');
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_registrations where app_user_id=u)
  and not exists(select 1 from public.runmusic_contacts where app_user_id=u)
  and not exists(select 1 from public.runmusic_requests where app_user_id=u),'failed atomic input leaves nothing');
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0x'||repeat('c',40),'privy','embedded');
 perform public.react_to_creator(u,creator,extensions.gen_random_uuid(),extensions.gen_random_uuid(),'0x'||repeat('d',64));
 r:=public.submit_owned_runmusic_v3(u,input);
 perform pg_temp.rmt_assert((r->>'entered')::boolean and (r#>>'{contact,saved}')::boolean,'contact saved with entry');
 perform public.submit_owned_runmusic_v3(u,input||'{"ciphertext":"randomized-replay"}');
 perform pg_temp.rmt_assert((select ciphertext='cipher1' from public.runmusic_contacts where app_user_id=u),'replay stable across randomized ciphertext');
 perform pg_temp.rmt_assert((select count(*)=1 from public.runmusic_telegram_deliveries where app_user_id=u),'one new entry one outbox');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',u,input||jsonb_build_object('fingerprint',repeat('b',64))),'RUNMUSIC_CONFLICT');
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v2(%L,%L)',u,jsonb_build_object('action','enter','requestKey',k)),'RUNMUSIC_CONFLICT');
 perform public.submit_owned_runmusic_v3(u,input||jsonb_build_object('requestKey',extensions.gen_random_uuid(),'ciphertext','latest'));
 insert into public.runmusic_missions(app_user_id,mission)values(legacy,'photo');
 perform public.submit_owned_runmusic_v3(legacy,input||jsonb_build_object('requestKey',extensions.gen_random_uuid()));
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_telegram_deliveries where app_user_id=legacy),'legacy entry never backfilled');
 insert into public.runmusic_registrations(app_user_id)values(v);
 perform public.submit_owned_runmusic_v2(v,jsonb_build_object('action','save_contact','requestKey',extensions.gen_random_uuid(),'ciphertext','old','masked','o***','fingerprint','old'));
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_telegram_deliveries where app_user_id=v),'old save_contact never queues');
 j:=public.claim_runmusic_telegram_delivery(u);
 perform pg_temp.rmt_assert(j is not null and public.claim_runmusic_telegram_delivery(u) is null,'parallel claim fenced');
 old_token:=(j->>'claimToken')::uuid;
 update public.runmusic_telegram_deliveries set lease_until=clock_timestamp()-interval'1 second' where app_user_id=u;
 j:=public.claim_runmusic_telegram_delivery(u);
 perform pg_temp.rmt_assert((j->>'claimToken')::uuid<>old_token,'expired pre-send lease reclaim');
 perform pg_temp.rmt_assert(public.begin_runmusic_telegram_delivery((j->>'id')::uuid,old_token,'-100123') is null,'old claim fenced');
 update public.app_users set verified_email='latest@example.invalid' where id=u;
 payload:=public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123');
 perform pg_temp.rmt_assert(payload->>'email'='latest@example.invalid' and payload->>'ciphertext'='latest','begin uses latest trusted snapshot');
 perform pg_temp.rmt_assert(public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123') is null,'begin once only');
 perform pg_temp.rmt_assert(not public.finish_runmusic_telegram_delivery((j->>'id')::uuid,old_token,'sent',42),'old finish fenced');
 perform pg_temp.rmt_error(format('select public.finish_runmusic_telegram_delivery(%L,%L,''sent'',0)',j->>'id',j->>'claimToken'),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rmt_error(format('select public.finish_runmusic_telegram_delivery(%L,%L,''unknown'',null,null,''private raw error'')',j->>'id',j->>'claimToken'),'RUNMUSIC_INVALID_REQUEST');
 for i in 1..5 loop
  perform pg_temp.rmt_assert(public.finish_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'throttled',null,120),'definitive throttling finish');
  if i<5 then
   perform pg_temp.rmt_assert((select state='pending' and next_retry_at>clock_timestamp()+interval'119 seconds' from public.runmusic_telegram_deliveries where app_user_id=u),'retry_after honored');
   update public.runmusic_telegram_deliveries set next_retry_at=clock_timestamp()-interval'1 second' where app_user_id=u;
   j:=public.claim_runmusic_telegram_delivery(u);
   perform public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123');
  end if;
 end loop;
 perform pg_temp.rmt_assert((select state='failed' and attempts=5 from public.runmusic_telegram_deliveries where app_user_id=u),'429 retry cap');
 perform pg_temp.rmt_assert(public.claim_runmusic_telegram_delivery(u) is null,'exhausted never retries');
 -- Every non-retry provider outcome fences the claim permanently.
 foreach f in array array['sent','rejected','invalid_contact','unknown'] loop
  delete from public.runmusic_telegram_deliveries where app_user_id=u;
  insert into public.runmusic_telegram_deliveries(app_user_id)values(u);
  j:=public.claim_runmusic_telegram_delivery(u);
  perform public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123');
  perform pg_temp.rmt_assert(public.finish_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,f,
   case when f='sent' then 123::bigint end),'terminal finish '||f);
  perform pg_temp.rmt_assert(public.claim_runmusic_telegram_delivery(u) is null,'terminal never retried '||f);
  perform pg_temp.rmt_assert(not public.finish_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,f,
   case when f='sent' then 123::bigint end),'terminal duplicate finish fenced '||f);
 end loop;
 -- Test terminal paths with disposable reference-only rows.
 delete from public.runmusic_telegram_deliveries where app_user_id=u;
 insert into public.runmusic_telegram_deliveries(app_user_id)values(u);
 j:=public.claim_runmusic_telegram_delivery(u);
 perform public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123');
 update public.runmusic_telegram_deliveries set lease_until=clock_timestamp()-interval'1 second' where app_user_id=u;
 perform pg_temp.rmt_assert(public.claim_runmusic_telegram_delivery(u) is null,'stale sending never reclaimed');
 perform pg_temp.rmt_assert((select state='unknown' from public.runmusic_telegram_deliveries where app_user_id=u),'stale sending terminal unknown');
 perform pg_temp.rmt_assert(not public.finish_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'sent',42),'late completion fenced');
 delete from public.runmusic_telegram_deliveries where app_user_id=u;
 insert into public.runmusic_telegram_deliveries(app_user_id)values(u);
 j:=public.claim_runmusic_telegram_delivery(u);
 update public.app_users set status='disabled' where id=u;
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_contacts where app_user_id=u),'disable scrubs contact');
 perform pg_temp.rmt_assert(public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123') is null,'disabled account skips');
 perform pg_temp.rmt_assert((select state='skipped' from public.runmusic_telegram_deliveries where app_user_id=u),'disabled terminal skip');
 update public.app_users set status='active' where id=u;
 delete from public.runmusic_telegram_deliveries where app_user_id=u;
 insert into public.runmusic_telegram_deliveries(app_user_id)values(u);
 j:=public.claim_runmusic_telegram_delivery(u);
 perform pg_temp.rmt_assert(public.begin_runmusic_telegram_delivery((j->>'id')::uuid,(j->>'claimToken')::uuid,'-100123') is null,'missing purged contact skips');
 -- Publication blocks loser reinsertion, including the combined entry API.
 update public.runmusic_campaign set results_published=true,draw_id=extensions.gen_random_uuid(),drawn_at=clock_timestamp();
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',legacy,input||jsonb_build_object('requestKey',extensions.gen_random_uuid())),'RUNMUSIC_CLOSED');
 insert into public.runmusic_draw_entries(draw_id,app_user_id,weight,mission_snapshot,rank,winner,receipt_id,prize_code,received_at)
  select draw_id,v,1,'[]'::jsonb,1,true,extensions.gen_random_uuid(),'andong_yogurt_1l',clock_timestamp()-interval'31 days' from public.runmusic_campaign;
 perform pg_temp.rmt_error(format('select public.submit_owned_runmusic_v3(%L,%L)',v,input||jsonb_build_object('requestKey',extensions.gen_random_uuid())),'RUNMUSIC_CLOSED');
 update public.runmusic_draw_entries set received_at=clock_timestamp()-interval'29 days' where app_user_id=v;
 perform public.submit_owned_runmusic_v3(v,input||jsonb_build_object('requestKey',extensions.gen_random_uuid()));
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_telegram_deliveries where app_user_id=v),'winner contact update never backfills');
 perform public.purge_due_runmusic_contacts();
 perform pg_temp.rmt_assert(not exists(select 1 from public.runmusic_contacts where app_user_id=legacy),'published losers purged');
end $$;
rollback;

import os,subprocess,concurrent.futures,json,pathlib
if os.environ.get('PGDATABASE')!='byus_clean' or not os.environ.get('PGHOST','').startswith('/'):
 raise SystemExit('Disposable Unix socket byus_clean required')
def sql(text,allow=False):
 r=subprocess.run(['psql','-X','-At','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,env={**os.environ,'PGOPTIONS':'-c lock_timeout=15s -c statement_timeout=30s'})
 if not allow and r.returncode:raise RuntimeError(r.stderr)
 return {'code':r.returncode,'stdout':r.stdout.strip(),'stderr':r.stderr.strip()}
if sql("select current_database()||'|'||coalesce(inet_server_addr()::text,'unix');")['stdout']!='byus_clean|unix':raise SystemExit('Wrong database transport')
u='59700000-0000-4000-8000-000000000001';c='59700000-0000-4000-8000-000000000002';e='59700000-0000-4000-8000-000000000003';p='59700000-0000-4000-8000-000000000004';v='59700000-0000-4000-8000-000000000005';j='59700000-0000-4000-8000-000000000006';k='59700000-0000-4000-8000-000000000007'
sql(f'''begin;
insert into public.app_users(id,privy_user_id,verified_email)values('{u}','did:privy:fan-economy-concurrency','fan-economy-concurrency@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values('{c}','fan-economy-concurrency','published','/fixture.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select '{c}',locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
insert into public.mobile_fan_economy_policies(id,celebrity_id,version,kind,rules,effective_at)values('{e}','{c}','e','earning','{{"comment":10}}',now()),('{p}','{c}','x','exchange','{{"free_vote":10}}',now()),('{v}','{c}','v','vote','{{"freeEnabled":true,"paidInfluenceVerified":true,"influenceAlgorithm":"fixture-approved","maxPaidInfluenceBps":2000}}',now());
select public.mobile_fan_economy_post('{u}','{c}','fan_point',50,'fixture',extensions.gen_random_uuid(),'{e}');
insert into public.mobile_store_sandbox_testers(app_user_id,enabled)values('{u}',true);
insert into public.mobile_vote_product_policies(store,product_id,version,vote_quantity,effective_at)values('apple','fixture-concurrent-votes','sku',5,now());
insert into public.mobile_fan_gift_projects(id,celebrity_id,title,summary,opens_at,closes_at,status)values('{j}','{c}','Fixture','Fixture',now()-interval'1 day',now()+interval'1 day','open');
commit;''')
def pair(a,b):
 with concurrent.futures.ThreadPoolExecutor(2)as pool:return list(pool.map(lambda q:sql(q,True),[a,b]))
exchange=lambda key,units:f"select public.exchange_owned_mobile_fan_economy('{u}','{key}','fan-economy-concurrency','free_vote','x',{units});"
results={'sameKey':pair(exchange(k,2),exchange(k,2))}
assert all(r['code']==0 for r in results['sameKey']),results
results['overspend']=pair(exchange('59700000-0000-4000-8000-000000000008',2),exchange('59700000-0000-4000-8000-000000000009',2))
assert sum(r['code']==0 for r in results['overspend'])==1,results
ck='59700000-0000-4000-8000-000000000010'
cancel=f'''select public.cancel_owned_mobile_fan_economy_request('{u}','{ck}','exchange','{{"celebritySlug":"fan-economy-concurrency","target":"free_vote","policyVersion":"x","units":1}}');'''
results['cancelSubmit']=pair(exchange(ck,1),cancel)
assert results['cancelSubmit'][1]['code']==0,results
for n in['a','b']:
 intent=json.loads(sql(f"select public.create_owned_mobile_vote_intent('{u}',extensions.gen_random_uuid(),'fan-economy-concurrency','apple','fixture-concurrent-votes','sku');")['stdout'])
 sql(f"select public.apply_owned_mobile_vote_verified('{u}','apple','sandbox','concurrent-{n}','{intent['id']}','fixture-concurrent-votes','KRW',1000,0,'purchased','proof-{n}',now());")
 if n=='a':aid=intent['id']
results['voteRefund']=pair(f"select public.vote_owned_mobile_fan_gift('{u}','{j}',extensions.gen_random_uuid(),'v','paid',4);",f"select public.apply_mobile_vote_verified('apple','sandbox','concurrent-a','{aid}','fixture-concurrent-votes','KRW',1000,1000,'revoked','refund-a',now(),null);")
assert all(r['code']==0 for r in results['voteRefund']),results
sql(f'''do $$begin
 if exists(select 1 from public.mobile_vote_purchase_lots where app_user_id='{u}'and(quantity<spent+reversed or spent<0 or reversed<0))then raise exception 'Negative purchase lot';end if;
 if public.mobile_fan_economy_balance('{u}','{c}','paid_vote')<>(select sum(quantity-spent-reversed)from public.mobile_vote_purchase_lots where app_user_id='{u}')then raise exception 'Aggregate ledger differs from source lots';end if;
 if public.mobile_fan_economy_balance('{u}','{c}','fan_point')not in(0,10)then raise exception 'Concurrent exchange overdraft/duplicate';end if;
 if (select count(*)from public.mobile_fan_economy_requests where app_user_id='{u}'and request_key='{k}')<>1 then raise exception 'Duplicate request';end if;
end $$;''')
intent=json.loads(sql(f"select public.create_owned_mobile_vote_intent('{u}',extensions.gen_random_uuid(),'fan-economy-concurrency','apple','fixture-concurrent-votes','sku');")['stdout'])
paid_cancel=f'''select public.cancel_owned_mobile_fan_economy_request('{u}','{intent['requestKey']}','vote_intent','{{"celebritySlug":"fan-economy-concurrency","store":"apple","productId":"fixture-concurrent-votes","policyVersion":"sku"}}');'''
proof=f"select public.apply_mobile_vote_verified('apple','sandbox','cancel-proof-race','{intent['id']}','fixture-concurrent-votes','KRW',1000,0,'purchased','trusted-race',now(),null);"
results['cancelProof']=pair(paid_cancel,proof)
assert all(r['code']==0 for r in results['cancelProof']),results
read=json.loads(sql(f"select public.read_owned_mobile_vote_intent('{u}','{intent['requestKey']}');")['stdout'])
assert read['id']==intent['id'],('committed native proof hidden by cancellation',read)
# A real wallet debit commits while the new draw waits on the shared free-wallet lock.
b='59700000-0000-4000-8000-000000000081';bp='59700000-0000-4000-8000-000000000082';tx='59700000-0000-4000-8000-000000000083';drawkey='59700000-0000-4000-8000-000000000084'
sql(f"""begin;
insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)values('{b}','free-race','{c}','draft','text',now()-interval'1 hour',now()+interval'1 hour');
insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)select '{b}',locale,'Fixture','Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value)values('{b}','text','fixture');update public.benefits set publication_status='published',published_at=now()where id='{b}';
insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,allow_paid_tickets,enabled,opens_at,closes_at)values('{bp}','{b}','instant_draw','free-race',2,true,false,now()-interval'1 hour',now()+interval'1 hour');
insert into public.mobile_benefit_instant_prizes(policy_id,outcome,weight)values('{bp}','not_selected',1);update public.mobile_benefit_policies set enabled=true where id='{bp}';
insert into public.mobile_store_transactions(id,store,environment,external_transaction_id,app_user_id,celebrity_id,product_id,currency,amount_krw,ticket_quantity,support_rate_bps,reward_policy_version,state,verification_fingerprint,verified_at)select '{tx}','apple','sandbox','free-race-legacy','{u}','{c}','fixture','KRW',1000,2,0,version,'granted',repeat('a',64),now()from public.reward_policy_versions order by version desc limit 1;
insert into public.mobile_store_paid_ticket_ledger(app_user_id,celebrity_id,transaction_id,entry_kind,amount,owner_sequence,resulting_balance)values('{u}','{c}','{tx}','credit',2,1,2);
select public.post_fan_ticket_entry('{u}','{c}','credit',2,'fixture',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select max(version)from public.reward_policy_versions),null,null);commit;""")
debit=f"""begin;select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase1:ticket:balance:{u}:{c}',0));select public.post_fan_ticket_entry('{u}','{c}','debit',-2,'fixture',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select max(version)from public.reward_policy_versions),null,null);select pg_sleep(0.6);commit;"""
draw=f"select pg_sleep(0.15);select public.submit_owned_mobile_free_lucky('{u}','{drawkey}','fan-economy-concurrency','{b}','free-race');"
results['freeWalletRace']=pair(debit,draw)
assert all(r['code']==0 for r in results['freeWalletRace']) and json.loads(results['freeWalletRace'][1]['stdout'])['error']['code']=='INSUFFICIENT_TICKETS',results['freeWalletRace']
assert sql(f"select count(*)from public.mobile_store_paid_ticket_ledger where app_user_id='{u}'and entry_kind='debit';")['stdout']=='0','free race consumed legacy paid rights'
assert sql(f"select count(*)from public.mobile_benefit_draw_requests where id='{drawkey}';")['stdout']=='0','failed free race committed draw'
terminal=json.loads(results['freeWalletRace'][1]['stdout'])
assert json.loads(sql(f"select public.read_owned_mobile_free_lucky('{u}','{drawkey}','lucky_draw');")['stdout'])==terminal
sql(f"select public.post_fan_ticket_entry('{u}','{c}','credit',4,'fixture',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select max(version)from public.reward_policy_versions),null,null);")
late=f"select public.submit_owned_mobile_free_lucky('{u}','{drawkey}','fan-economy-concurrency','{b}','free-race');"
newdraw=f"select public.submit_owned_mobile_free_lucky('{u}',extensions.gen_random_uuid(),'fan-economy-concurrency','{b}','free-race');"
results['lateTerminalNewWallet']=pair(late,newdraw)
assert all(r['code']==0 for r in results['lateTerminalNewWallet'])
assert json.loads(results['lateTerminalNewWallet'][0]['stdout'])==terminal
assert json.loads(results['lateTerminalNewWallet'][1]['stdout'])['freeTicketsUsed']==2
assert sql(f"select public.get_fan_ticket_balance('{u}','{c}');")['stdout']=='2','late terminal request debited replenished wallet'
conflict=sql(f"select public.submit_owned_mobile_free_lucky('{u}','{drawkey}','fan-economy-concurrency','{b}','different-policy');",True)
assert conflict['code']!=0 and 'MOBILE_BENEFIT_REQUEST_CONFLICT'in conflict['stderr']
assert sql(f"select public.read_owned_mobile_free_lucky('57000000-0000-4000-8000-000000000001','{drawkey}','lucky_draw');")['stdout']=='','crossowner terminal leaked'
sql(f"select public.post_fan_ticket_entry('{u}','{c}','debit',-2,'fixture',extensions.gen_random_uuid(),extensions.gen_random_uuid(),(select max(version)from public.reward_policy_versions),null,null);")
mixedkey='59700000-0000-4000-8000-000000000085'
freepost=f"select public.submit_owned_mobile_free_lucky('{u}','{mixedkey}','fan-economy-concurrency','{b}','free-race');"
legacypost=f"select public.draw_owned_mobile_benefit('{u}','{b}','{mixedkey}','free-race',now());"
results['freeTerminalLegacyPaidRace']=pair(freepost,legacypost)
f,l=results['freeTerminalLegacyPaidRace']
if f['code']==0:
 assert json.loads(f['stdout'])['terminal']['proof']=='immutable_lucky_request'
 assert l['code']!=0 and 'MOBILE_BENEFIT_REQUEST_CONFLICT'in l['stderr']
 assert sql(f"select count(*)from public.mobile_store_paid_ticket_ledger where app_user_id='{u}'and entry_kind='debit';")['stdout']=='0'
else:
 assert 'MOBILE_BENEFIT_REQUEST_CONFLICT'in f['stderr'] and l['code']==0
 assert json.loads(l['stdout'])['paidTicketsUsed']==2
assert sql(f"select count(*)from public.mobile_benefit_draw_requests where id='{mixedkey}';")['stdout']in('0','1')

print('PASS same key, overspend, cancel-submit and vote-refund races; no negative balances/deadlocks')
# Concurrent correction replay uses the same owner/wallet order as exchanges.
cu='59710000-0000-4000-8000-000000000001'
src='59710000-0000-4000-8000-000000000002'
ce='59710000-0000-4000-8000-000000000003'
sql(f'''begin;
insert into public.mobile_fan_earning_cutovers select celebrity_id,id,effective_at,version from public.mobile_fan_economy_policies where id='{e}';
insert into public.app_users(id,privy_user_id,verified_email)values('{cu}','did:privy:correction-race','correction-race@example.test');
insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values('{c}','correction-race','correction','{{"mode":"revoke_unspent_points"}}',clock_timestamp());
insert into public.fan_posts(id,app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)values('{src}','{cu}','{c}','correction race',extensions.gen_random_uuid(),'fixture',true,clock_timestamp());
commit;''')
correct=lambda version:f"select public.request_mobile_fan_reward_correction('{cu}','{src}','{ce}','{version}','correction-race');"
conflicting=pair(correct('v1'),correct('v2'))
assert sum(r['code']==0 for r in conflicting)==1,conflicting
assert any('FAN_ECONOMY_REQUEST_CONFLICT' in r['stderr'] for r in conflicting),conflicting
winner=json.loads(next(r['stdout'] for r in conflicting if r['code']==0))['version']
replays=pair(correct(winner),correct(winner))
assert all(r['code']==0 and json.loads(r['stdout'])['replayed'] for r in replays),replays
assert sql(f"select count(*) from public.mobile_fan_economy_ledger where app_user_id='{cu}' and source_type='correction';")['stdout']=='1'
assert sql(f"select public.mobile_fan_economy_balance('{cu}','{c}','fan_point');")['stdout']=='0'
assert sql("select count(*) from public.mobile_fan_economy_ledger where resulting_balance<0;")['stdout']=='0'
print('PASS concurrent correction exact replay and differing-body conflict; one immutable debit')

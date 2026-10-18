import concurrent.futures
import os
from pathlib import Path
import subprocess
import time

if os.environ.get('PGDATABASE') != 'byus_clean' or not os.environ.get('PGHOST', '').startswith('/'):
    raise SystemExit('Disposable Unixsocket byus_clean required')

def sql(statement):
    result = subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement,
                            text=True, capture_output=True,
                            env={**os.environ, 'PGOPTIONS': '-c lock_timeout=10s -c statement_timeout=20s'})
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

assert sql("select current_database()||'|'||coalesce(inet_server_addr()::text,'unix');") == 'byus_clean|unix'
# Reuse real private-proof/quiz/passport/admin setup; earlier SQL suites roll it back.
fixture = Path(__file__).with_name('mobile_fan_certification_cutover.sql').read_text()
setup = fixture[:fixture.index('insert into public.mobile_fan_economy_policies')]
setup += '''
update public.celebrities set status='published',published_at=now() where id='c3100000-0000-4000-8000-000000000001';
do $$declare mission uuid;submission uuid;begin
 mission:=(public.save_admin_certification_mission('c3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),null::uuid,'c3100000-0000-4000-8000-000000000001','activation-race',null::bigint,'티켓 영수증','인증','Certification','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '1 day',2::smallint,1::bigint)->>'id')::uuid;
 perform public.set_admin_certification_mission_status('c3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),mission,1,'active');
 perform public.register_owned_certification_upload('c3000000-0000-4000-8000-000000000001',mission,'c3700000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001/'||mission||'/c3700000-0000-4000-8000-000000000003.webp',100,10,10,repeat('e',64));
 perform public.submit_owned_certification('c3000000-0000-4000-8000-000000000001',mission,extensions.gen_random_uuid(),'["c3700000-0000-4000-8000-000000000003"]',null,null);
end $$;
commit;
'''
sql(setup)
source = sql("select id from public.certification_submissions where app_user_id='c3000000-0000-4000-8000-000000000001';")
activation = '''set application_name='byus-t2-activation-race';begin;
select public.activate_mobile_fan_earning('c3100000-0000-4000-8000-000000000001','race-policy',(select jsonb_object_agg(action,case when action='certification' then 14 else 0 end) from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone']) action));
select pg_sleep(2);commit;'''
review = f"select public.review_admin_certification_submission('c3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000010',extensions.gen_random_uuid(),'{source}',extensions.gen_random_uuid(),1,'approve',null);"
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    active = pool.submit(sql, activation)
    deadline = time.monotonic() + 10
    while sql("select count(*) from pg_stat_activity where application_name='byus-t2-activation-race' and wait_event='PgSleep';") != '1':
        if active.done():
            active.result()
            raise AssertionError('Activation committed before race barrier')
        if time.monotonic() > deadline:
            raise AssertionError('Activation barrier timeout')
        time.sleep(0.03)
    approved = pool.submit(sql, review)
    active.result()
    approved.result()
proof = sql(f"""select jsonb_build_object('reviewAfterBoundary',s.reviewed_at>=c.effective_at,
 'pointAmount',public.mobile_fan_economy_balance(s.app_user_id,s.celebrity_id,'fan_point'),
 'legacyReviewCredits',(select count(*) from public.fan_ticket_ledger l where l.source_id=s.id and l.source_type='manual_certification'),
 'pointReceipts',(select count(*) from public.mobile_fan_economy_activity_receipts r where r.source_id=s.id))
 from public.certification_submissions s join public.mobile_fan_earning_cutovers c using(celebrity_id) where s.id='{source}';""")
print('ACTIVATION_REVIEW_RACE', proof, flush=True)
import json
proof = json.loads(proof)
assert proof == {'reviewAfterBoundary': True, 'pointAmount': 14, 'legacyReviewCredits': 0, 'pointReceipts': 1}, 'Activation/review chose stale legacy branch'
print('PASS activation vs actual admin certification review: original boundary, one point receipt, no legacy credit')

def hold_then_request(holding, request, tag, commit=True):
    name = 'byus-t2-' + tag
    statement = f"set application_name='{name}';begin;" + holding + ';select pg_sleep(2);' + ('commit;' if commit else 'rollback;')
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        held = pool.submit(sql, statement)
        deadline = time.monotonic() + 10
        while sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event='PgSleep';") != '1':
            if held.done():
                held.result()
                raise AssertionError(tag + ': missing barrier')
            if time.monotonic() > deadline:
                raise AssertionError(tag + ': barrier timeout')
            time.sleep(0.03)
        requested = pool.submit(sql, request)
        held.result()
        requested.result()

cg = 'c3900000-0000-4000-8000-000000000001'
cr = 'c3900000-0000-4000-8000-000000000002'
u1 = 'c3000000-0000-4000-8000-000000000001'
u2 = 'c3000000-0000-4000-8000-000000000002'
u3 = 'c3000000-0000-4000-8000-000000000003'
sql(f'''begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
('{cg}','t2-activation-trigger','published','/fixture.webp',now(),'{{creator}}','creator'),
('{cr}','t2-rollback-trigger','published','/fixture.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
select c,locale,'Fixture','Fixture','Fixture' from unnest(array['{cg}'::uuid,'{cr}'::uuid])c cross join unnest(enum_range(null::public.content_locale))locale;
insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values('{cg}',true),('{cr}',true);
commit;''')
activate_statement = activation[activation.index('select public.activate'):activation.index('select pg_sleep')]
activate_statement = activate_statement.replace("action='certification'", "action in('certification','comment')")

def post(owner, creator, timestamp='clock_timestamp()'):
    return f"insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)values('{owner}','{creator}','activation source race',extensions.gen_random_uuid(),'fixture',true,{timestamp});"

def balances(owner, creator):
    return sql(f"select public.mobile_fan_economy_balance('{owner}','{creator}','fan_point')||'|'||public.get_fan_ticket_balance('{owner}','{creator}');")

hold_then_request(activate_statement.replace('c3100000-0000-4000-8000-000000000001', cg), post(u1, cg), 'activation-trigger')
assert balances(u1, cg) == '14|0', 'committed activation selected legacy activity trigger'
print('PASS uncommitted activation vs actual fan-post trigger: point only, FK lock compatible')
hold_then_request(activate_statement.replace('c3100000-0000-4000-8000-000000000001', cr), post(u1, cr), 'rollback-trigger', commit=False)
assert balances(u1, cr) == '0|1', 'rolled-back activation lost legacy reward'
assert sql(f"select count(*) from public.mobile_fan_earning_cutovers where celebrity_id='{cr}';") == '0'
print('PASS rolled-back activation vs actual fan-post trigger: legacy reward retained')
retire = f"update public.mobile_fan_economy_policies set retired_at=clock_timestamp() where celebrity_id='{cg}' and kind='earning' and retired_at is null"
delayed = f"(select effective_at+interval '1 millisecond' from public.mobile_fan_earning_cutovers where celebrity_id='{cg}')"
hold_then_request(retire, post(u2, cg, delayed), 'retire-delayed-source')
assert balances(u2, cg) == '14|0', 'retirement changed original delayed point contract'
sql(post(u3, cg))
assert balances(u3, cg) == '0|0', 'stopped earning fell back to legacy'
print('PASS retirement vs delayed point source: original policy retained; post-stop source has no new asset')
# Reverse ordering: a producer holds creator/FK/point-wallet locks while retirement waits.
sql(activate_statement.replace('c3100000-0000-4000-8000-000000000001', cr))
retire_reverse = f"update public.mobile_fan_economy_policies set retired_at=clock_timestamp() where celebrity_id='{cr}' and kind='earning' and retired_at is null;"
hold_then_request(post(u2, cr), retire_reverse, 'producer-before-retire')
assert balances(u2, cr) == '14|0', 'producer/retirement reverse order changed award'
assert sql(f"select count(*) from public.mobile_fan_economy_policies where celebrity_id='{cr}' and kind='earning' and retired_at is not null;") == '1'
print('PASS producer then concurrent retirement: no deadlock, one point award')

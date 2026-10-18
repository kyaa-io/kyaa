import concurrent.futures
import json
import os
import subprocess
import uuid

if os.environ.get('PGDATABASE') != 'byus_clean' or not os.environ.get('PGHOST', '').startswith('/'):
    raise SystemExit('Disposable Unixsocket byus_clean required')
def sql(statement, allow=False):
    r = subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True,
                       capture_output=True, env={**os.environ, 'PGOPTIONS': '-c lock_timeout=10s -c statement_timeout=20s'})
    if r.returncode and not allow:
        raise RuntimeError(r.stderr)
    return r

def pair(first, second):
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        return list(pool.map(lambda q: sql(q, True), [first, second]))

owner = 'e9000000-0000-4000-8000-000000000001'
creator = 'e9000000-0000-4000-8000-000000000002'
policy = 'e9000000-0000-4000-8000-000000000003'
sql(f"""begin;insert into public.app_users(id,privy_user_id,verified_email)values('{owner}','did:privy:heart-races','heart-races@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values('{creator}','heart-races','published','/fixture.webp',now(),'{{creator}}','creator');
insert into public.mobile_fan_economy_policies(id,celebrity_id,version,kind,rules,effective_at)values('{policy}','{creator}','race','exchange','{{"support_voucher":100}}',now());
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select '{creator}',locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
select public.mobile_fan_economy_post('{owner}','{creator}','fan_point',400,'fixture',extensions.gen_random_uuid(),'{policy}');commit;""")
def exchange(key, units=1):
    return f"select public.exchange_owned_mobile_fan_economy('{owner}','{key}','heart-races','support_voucher','race',{units});"
def send(key, units=1):
    return f"select public.send_owned_mobile_fan_support('{owner}','{key}','heart-races','race',{units});"
key = uuid.uuid4()
r = pair(exchange(key, 2), exchange(key, 2))
assert all(x.returncode == 0 for x in r), [x.stderr for x in r]
assert sql(f"select public.mobile_fan_economy_balance('{owner}','{creator}','support_voucher');").stdout.strip() == '2'
r = pair(exchange(uuid.uuid4(), 2), exchange(uuid.uuid4(), 2))
assert sum(x.returncode == 0 for x in r) == 1, [x.stderr for x in r]
key = uuid.uuid4()
r = pair(send(key, 2), send(key, 2))
assert all(x.returncode == 0 for x in r), [x.stderr for x in r]
assert sql(f"select sum(units)from public.mobile_fan_support_contributions where app_user_id='{owner}';").stdout.strip() == '2'
r = pair(send(uuid.uuid4(), 2), send(uuid.uuid4(), 2))
assert sum(x.returncode == 0 for x in r) == 1, [x.stderr for x in r]
sql(f"select public.mobile_fan_economy_post('{owner}','{creator}','support_voucher',1,'fixture',extensions.gen_random_uuid(),'{policy}');")
key = uuid.uuid4()
cancel = f"""select public.cancel_owned_mobile_fan_economy_request('{owner}','{key}','support','{{"celebritySlug":"heart-races","policyVersion":"race","units":1}}');"""
r = pair(send(key), cancel)
assert r[1].returncode == 0, r[1].stderr
outcome = json.loads(r[1].stdout)
state = json.loads(sql(f"select public.read_owned_mobile_fan_economy_request('{owner}','{key}','support');").stdout)
if outcome['status'] == 'cancelled':
    assert r[0].returncode != 0 and state['status'] == 'cancelled'
else:
    assert r[0].returncode == 0 and state['replayed'] is True
assert sql(f"select count(*)from public.mobile_fan_economy_ledger where app_user_id='{owner}'and resulting_balance<0;").stdout.strip() == '0'
print('PASS concurrent same/different-key exchange, support overspend, same-key send and cancel/send; one immutable contribution and no negative balance')

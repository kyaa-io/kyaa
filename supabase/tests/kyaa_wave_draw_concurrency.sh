#!/usr/bin/env bash
set -euo pipefail
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket ]]; then
  echo 'Disposable local database required' >&2; exit 1
fi
python3 - <<'PY'
import os, subprocess, uuid, concurrent.futures, time
assert os.environ['PGDATABASE']=='byus_clean'
base=['psql','-X','-At','-v','ON_ERROR_STOP=1']
def sql(statement, ok=True):
 result=subprocess.run(base+['-c',statement],text=True,capture_output=True)
 if ok: assert result.returncode==0,result.stderr
 return result
owner='91a00000-0000-4000-8000-000000000001'; admin='91a00000-0000-4000-8000-000000000002'
def uid(): return str(uuid.uuid4())
def execute(request): return f"select public.execute_admin_kyaa_wave_draw('{admin}','{admin}','{uid()}','{request}')"
def reveal(draw,index,request): return f"select public.reveal_admin_kyaa_wave_draw('{admin}','{admin}','{uid()}','{draw}',{index},'{request}')"
def hold(statement):
 process=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
 process.stdin.write("begin;"+statement+";select 'LOCKED';\n");process.stdin.flush()
 while True:
  line=process.stdout.readline()
  assert line,process.stderr.read()
  if line.strip()=='LOCKED': return process

def release(process):
 process.stdin.write('commit;\n');process.stdin.close();assert process.wait(timeout=10)==0,process.stderr.read()
sql(f"""
begin;
insert into public.app_users(id,privy_user_id,verified_email) values
('{owner}','did:privy:wave-draw-concurrency-owner','wave-draw-concurrency-owner@example.test'),
('{admin}','did:privy:wave-draw-concurrency-admin','wave-draw-concurrency-admin@example.test');
insert into public.admin_allowlist(id,email,role,active) values('{admin}','wave-draw-concurrency-admin@example.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('{uid()}','kyaa-wave-fanpage','published','/fixture.webp',now(),'{{brand}}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) select id,locale,'Wave fixture','Fixture summary','Fixture image' from public.celebrities cross join unnest(enum_range(null::public.content_locale)) locale where slug='kyaa-wave-fanpage';
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values('{owner}','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('kyaa_wave_draw_concurrency:0')||md5('kyaa_wave_draw_concurrency:0'));
select public.save_owned_kyaa_wave_draw_preferences('{owner}',array['camera','meal','blue'],'{uid()}');
commit;
""")
# Account held by another transaction: no waiting, no seed or candidates or request response committed.
request=uid();lock=hold(f"select pg_advisory_xact_lock(hashtextextended('fan-web-user:{owner}',0))")
failed=sql(execute(request),False)
assert failed.returncode!=0 and 'FAN_WEB_ACCOUNT_BUSY' in failed.stderr,failed.stderr
assert sql('select id is null from public.kyaa_wave_draw_state').stdout.strip()=='t'
assert sql('select count(*) from public.kyaa_wave_draw_candidates').stdout.strip()=='0'
assert sql(f"select count(*) from public.kyaa_wave_draw_requests where request_id='{request}'").stdout.strip()=='0'
release(lock)
# A save owning the account waits for state. Execution must back off rather than deadlock.
lock=hold('select singleton from public.kyaa_wave_draw_state for update')
save_request=uid()
save=subprocess.Popen(base+['-c',f"select public.save_owned_kyaa_wave_draw_preferences('{owner}',array['blue','meal','camera'],'{save_request}')"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
for _ in range(100):
 count=sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like 'select public.save_owned_kyaa_wave_draw_preferences(%'").stdout.strip()
 if count=='1':break
 time.sleep(.02)
else: raise AssertionError('save did not reach state lock')
with concurrent.futures.ThreadPoolExecutor() as pool:
 future=pool.submit(sql,execute(request),False)
 release(lock)
 saved_out,saved_err=save.communicate(timeout=10);assert save.returncode==0,saved_err
 attempted=future.result(timeout=10)
 # Scheduling may allow the save to release its account before execution checks it.
 assert attempted.returncode==0 or 'FAN_WEB_ACCOUNT_BUSY' in attempted.stderr,attempted.stderr
# Same request after a busy rollback and two simultaneous executions yields one draw, one audit.
with concurrent.futures.ThreadPoolExecutor() as pool:
 responses=list(pool.map(lambda _:sql(execute(request)).stdout.strip(),range(2)))
assert responses[0]==responses[1]
draw=sql('select id from public.kyaa_wave_draw_state').stdout.strip()
assert sql("select count(*) from public.audit_logs where action='kyaa_wave.draw_executed'").stdout.strip()=='1'
assert sql('select preferences[1] from public.kyaa_wave_draw_candidates').stdout.strip()=='blue'
assert sql('select prize_key from public.kyaa_wave_draw_candidates').stdout.strip()=='blue'
assert sql(execute(uid()),False).returncode!=0
# Duplicate concurrent reveals persist exactly one step, returning one fixed response.
reveal_request=uid()
with concurrent.futures.ThreadPoolExecutor() as pool:
 responses=list(pool.map(lambda _:sql(reveal(draw,1,reveal_request)).stdout.strip(),range(2)))
assert responses[0]==responses[1]
assert sql('select revealed_through from public.kyaa_wave_draw_state').stdout.strip()=='1'
assert sql("select count(*) from public.audit_logs where action='kyaa_wave.draw_revealed'").stdout.strip()=='1'
assert sql(reveal(draw,3,uid()),False).returncode!=0
print('Wave draw concurrency passed: busy rollback, save/draw overlap, duplicate execution, fixed retries, duplicate reveal, strict next.')
PY

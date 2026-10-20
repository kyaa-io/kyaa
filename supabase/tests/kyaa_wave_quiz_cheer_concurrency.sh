#!/usr/bin/env bash
set -euo pipefail
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket ]]; then
  echo 'Disposable local database required' >&2; exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/kyaa_wave_mission_progress.sql"
psql -X -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/kyaa_wave_draw.sql"
python3 - <<'PY'
import concurrent.futures, os, subprocess, time, uuid
assert os.environ['PGDATABASE']=='byus_clean'
base=['psql','-X','-At','-v','ON_ERROR_STOP=1']
def sql(statement, ok=True):
    result=subprocess.run(base+['-c',statement],text=True,capture_output=True,timeout=20)
    if ok: assert result.returncode==0,result.stderr
    return result

def uid(): return str(uuid.uuid4())
owner='91c00000-0000-4000-8000-000000000001'
other='91c00000-0000-4000-8000-000000000002'
admin='91c00000-0000-4000-8000-000000000003'
sql(f"""
begin;
insert into public.app_users(id,privy_user_id,verified_email) values
('{owner}','did:privy:quiz-race-owner','quiz-race-owner@example.test'),
('{other}','did:privy:quiz-race-other','quiz-race-other@example.test'),
('{admin}','did:privy:quiz-race-admin','quiz-race-admin@example.test');
insert into public.admin_allowlist(id,email,role,active) values('{admin}','quiz-race-admin@example.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('{uid()}','kyaa-wave-fanpage','published','/fixture.webp',now(),'{{brand}}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) select id,locale,'Wave fixture','Fixture summary','Fixture image' from public.celebrities cross join unnest(enum_range(null::public.content_locale)) locale where slug='kyaa-wave-fanpage';
insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values
('{owner}','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture'),
('{other}','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture');
select public.save_owned_kyaa_wave_draw_preferences('{owner}',array['camera','meal','blue'],'{uid()}');
select public.save_owned_kyaa_wave_draw_preferences('{other}',array['camera','meal','blue'],'{uid()}');
commit;
""")
participant=sql(f"select id from public.kyaa_wave_participants where app_user_id='{owner}'").stdout.strip()
other_participant=sql(f"select id from public.kyaa_wave_participants where app_user_id='{other}'").stdout.strip()
def grant(participant): return f"select public.grant_admin_kyaa_wave_quiz_stamp('{admin}','{admin}','{participant}','{uid()}')"
def draw(request): return f"select public.execute_admin_kyaa_wave_draw('{admin}','{admin}','{uid()}','{request}')"
def hold(statement):
    process=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    process.stdin.write('begin;'+statement+";select 'LOCKED';\n");process.stdin.flush()
    while True:
        line=process.stdout.readline()
        assert line,process.stderr.read()
        if line.strip()=='LOCKED': return process

def release(process):
    process.stdin.write('commit;\n');process.stdin.close()
    assert process.wait(timeout=10)==0,process.stderr.read()

# Force both grants to overlap at the owner lock, rather than relying on scheduling.
lock=hold(f"select pg_advisory_xact_lock(hashtextextended('fan-web-user:{owner}',0))")
with concurrent.futures.ThreadPoolExecutor() as pool:
    futures=[pool.submit(sql,grant(participant)) for _ in range(2)]
    for _ in range(100):
        if sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like 'select public.grant_admin_kyaa_wave_quiz_stamp(%'").stdout.strip()=='2': break
        time.sleep(.02)
    else: raise AssertionError('both grants did not wait for owner lock')
    release(lock)
    responses=[future.result(timeout=10).stdout.strip() for future in futures]
assert responses[0]==responses[1],responses
assert sql(f"select count(*) from public.audit_logs where action='kyaa_wave.quiz_stamp_granted' and entity_id='{participant}'").stdout.strip()=='1'

# New grant holds owner then waits for draw state. Draw must roll back busy or
# snapshot after that grant; either serial outcome must preserve the ticket count.
lock=hold('select singleton from public.kyaa_wave_draw_state for update')
request=uid()
with concurrent.futures.ThreadPoolExecutor() as pool:
    stamping=pool.submit(sql,grant(other_participant))
    for _ in range(100):
        if sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like 'select public.grant_admin_kyaa_wave_quiz_stamp(%'").stdout.strip()=='1': break
        time.sleep(.02)
    else: raise AssertionError('grant did not reach state lock')
    drawing=pool.submit(sql,draw(request),False)
    for _ in range(100):
        if sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like 'select public.execute_admin_kyaa_wave_draw(%'").stdout.strip()=='1': break
        time.sleep(.02)
    else: raise AssertionError('draw did not overlap grant')
    release(lock)
    stamping.result(timeout=10)
    result=drawing.result(timeout=10)
    assert result.returncode==0 or 'FAN_WEB_ACCOUNT_BUSY' in result.stderr,result.stderr
sql(draw(request))
assert sql('select count(*) from public.kyaa_wave_draw_candidates where tickets=2').stdout.strip()=='2','draw includes each committed quiz stamp exactly once'
assert sql("select count(*) from public.audit_logs where action='kyaa_wave.quiz_stamp_granted'").stdout.strip()=='2'
assert sql("select count(*) from public.audit_logs where action='kyaa_wave.draw_executed'").stdout.strip()=='1'
assert sql(grant(other_participant)).returncode==0,'postdraw replay allowed'
print('Wave quiz concurrency passed: overlapping grants preserve one timestamp/audit; grant/draw race preserves exact ticket snapshot and one draw audit.')
PY

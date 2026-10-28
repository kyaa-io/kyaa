#!/usr/bin/env bash
set -euo pipefail
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket ]]; then
  echo 'Disposable local database required' >&2; exit 1
fi
python3 - <<'PY'
import concurrent.futures, json, os, subprocess, time
assert os.environ['PGDATABASE']=='byus_clean'
base=['psql','-X','-At','-v','ON_ERROR_STOP=1']
def sql(statement, ok=True, app=None):
    result=subprocess.run(base+['-c',statement],text=True,capture_output=True,timeout=15,
        env={**os.environ, **({'PGAPPNAME':app} if app else {})})
    if ok: assert result.returncode==0,result.stderr
    return result
actor='93700000-0000-4000-8000-000000000001'
artist='93700000-0000-4000-8000-000000000002'
legacy_actor='93700000-0000-4000-8000-000000000003'
def payload(policy):
    return json.dumps([dict(position=q,promptKo='Question',promptEn='Question',active=True,
        options=[dict(position=o,labelKo='Dear Moon',labelEn='Dear Moon',active=True,isCorrect=o==1,
            **({} if policy is None else {'preserveOriginal':policy})) for o in range(1,5)]) for q in range(1,4)])
def save(name, quiz, policy, actor_id=actor):
    return f"select public.{name}('{actor_id}',extensions.gen_random_uuid(),'{artist}',{quiz},$payload${payload(policy)}$payload$::jsonb)"
sql(f"insert into public.admin_allowlist(id,email,role,active) values('{actor}','quiz-policy-race@example.test','admin',true),('{legacy_actor}','quiz-policy-race-legacy@example.test','admin',true); insert into public.celebrities(id,slug,image_url,roles,primary_role) values('{artist}','quiz-policy-race','/test.webp','{{artist}}','singer');")
sql(save('save_admin_quiz_version_v2','null',True))
quiz=sql(f"select id from public.celebrity_quizzes where celebrity_id='{artist}'").stdout.strip()
lock=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
lock.stdin.write(f"begin; select id from public.celebrities where id='{artist}' for update; select 'LOCKED';\n");lock.stdin.flush()
while True:
    line=lock.stdout.readline()
    assert line,lock.stderr.read()
    if line.strip()=='LOCKED': break
with concurrent.futures.ThreadPoolExecutor() as pool:
    legacy=pool.submit(sql,save('save_admin_quiz_version',f"'{quiz}'",None,legacy_actor),False,'quiz-policy-legacy-writer')
    for _ in range(100):
        if sql("select count(*) from pg_stat_activity where application_name='quiz-policy-legacy-writer' and wait_event_type='Lock'").stdout.strip()=='1': break
        time.sleep(.02)
    else: raise AssertionError('legacy writer did not reach the content row lock')
    lock.stdin.write(save('save_admin_quiz_version_v2',f"'{quiz}'",False)+"; commit;\n");lock.stdin.close()
    assert lock.wait(timeout=10)==0,lock.stderr.read()
    result=legacy.result(timeout=15)
assert result.returncode!=0 and 'translation policy requires current editor' in result.stderr,result.stderr
assert sql(f"select count(*) from public.celebrity_quiz_options o join public.celebrity_quiz_questions q on q.id=o.question_id where q.quiz_id='{quiz}' and not o.preserve_original").stdout.strip()=='12'
print('Quiz policy concurrency passed: old writer waits, then rejects without overwriting newly committed policies.')
PY

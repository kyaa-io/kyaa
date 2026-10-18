import concurrent.futures
import json
import os
import subprocess
import time

if os.environ.get('PGDATABASE') != 'byus_clean' or not os.environ.get('PGHOST', '').startswith('/'):
    raise SystemExit('Disposable Unixsocket byus_clean required')

def run(statement):
    r = subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement,
                       text=True, capture_output=True,
                       env={**os.environ, 'PGOPTIONS': '-c lock_timeout=10s -c statement_timeout=20s'})
    return {'code': r.returncode, 'out': r.stdout.strip(), 'err': r.stderr.strip()}

def sql(statement):
    r = run(statement)
    assert r['code'] == 0, r
    return r['out']

assert sql("select current_database()||'|'||coalesce(inet_server_addr()::text,'unix');") == 'byus_clean|unix'
red = os.environ.get('BYUS_T2_EXPECT_LOCK_FAILURES') == '1'
u1 = 'b1000000-0000-4000-8000-000000000001'
u2 = 'b1000000-0000-4000-8000-000000000002'
u3 = 'b1000000-0000-4000-8000-000000000003'
c = 'b1100000-0000-4000-8000-000000000001'
q = 'b1200000-0000-4000-8000-000000000001'
sql(f'''begin;
insert into public.app_users(id,privy_user_id,verified_email)values
('{u1}','did:privy:t2-rpc-1','t2-rpc-1@example.test'),
('{u2}','did:privy:t2-rpc-2','t2-rpc-2@example.test'),
('{u3}','did:privy:t2-rpc-3','t2-rpc-3@example.test');
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
select id,91342,'0x'||replace(id::text,'-','')||'00000000','privy','embedded' from public.app_users where id in('{u1}','{u2}','{u3}');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values('{c}','t2-upper-rpc','published','/fixture.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select '{c}',locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values('{c}',true);
create function public.t2_pause_real_post() returns trigger language plpgsql as $$begin perform pg_sleep(2);return new;end $$;
create trigger t2_pause_real_post before insert on public.fan_posts for each row execute function public.t2_pause_real_post();
commit;''')

def post(owner, name):
    return f"set application_name='{name}';select public.save_fan_post('{owner}','t2-upper-rpc',null::uuid,'Concurrent actual RPC','public','{{}}'::uuid[],null::integer,extensions.gen_random_uuid());"

def wait_barrier(names, count):
    deadline = time.monotonic() + 10
    quoted = ','.join("'" + x + "'" for x in names)
    while sql(f"select count(*) from pg_stat_activity where application_name in({quoted}) and wait_event='PgSleep';") != str(count):
        if time.monotonic() > deadline:
            raise AssertionError('Actual RPC barrier timeout: ' + ','.join(names))
        time.sleep(0.03)

with concurrent.futures.ThreadPoolExecutor(2) as pool:
    one = pool.submit(run, post(u1, 't2-real-post-one'))
    two = pool.submit(run, post(u2, 't2-real-post-two'))
    wait_barrier(['t2-real-post-one', 't2-real-post-two'], 2)
    results = [one.result(), two.result()]
print('ACTUAL_TWO_OWNER_POST_RPC', json.dumps(results), flush=True)
if red:
    assert sum(r['code'] == 0 for r in results) == 1 and any('deadlock detected' in r['err'] for r in results)
else:
    assert all(r['code'] == 0 for r in results), 'Actual save_fan_post RPC deadlock'
    assert sql(f"select count(*) from public.fan_posts where app_user_id in('{u1}','{u2}') and celebrity_id='{c}';") == '2'
    assert sql(f"select count(*) from public.fan_ticket_activity_awards where app_user_id in('{u1}','{u2}') and celebrity_id='{c}' and action_key='comment';") == '2'
sql('drop trigger t2_pause_real_post on public.fan_posts;drop function public.t2_pause_real_post();')
# Valid published 3-choice/4-option quiz; start and answer using the real current RPCs.
sql(f'''begin;
insert into public.celebrity_quizzes(id,celebrity_id,version,status)values('{q}','{c}',1,'draft');
do $$declare question uuid;begin
 for i in 1..3 loop
  insert into public.celebrity_quiz_questions(quiz_id,position,prompt_ko,prompt_en)values('{q}',i,'질문','Question')returning id into question;
  insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct)select question,n,'선택','Option',n=1 from generate_series(1,4)n;
 end loop;
end $$;
update public.celebrity_quizzes set status='published',published_at=now()where id='{q}';
select public.start_owned_quiz_attempt('{u3}','t2-upper-rpc',extensions.gen_random_uuid());
do $$declare answer record;begin
 for answer in select a.id attempt_id,qs.id question_id,o.id option_id from public.quiz_attempts a join public.quiz_attempt_questions qs on qs.attempt_id=a.id join public.quiz_attempt_options o on o.attempt_question_id=qs.id and o.is_correct where a.app_user_id='{u3}' loop
  perform public.save_owned_quiz_answer_v2('{u3}',answer.attempt_id,answer.question_id,answer.option_id,null);
 end loop;
end $$;
create function public.t2_pause_real_quiz() returns trigger language plpgsql as $$begin if new.status='passed' then perform pg_sleep(2);end if;return new;end $$;
create trigger t2_pause_real_quiz before update on public.quiz_attempts for each row execute function public.t2_pause_real_quiz();
commit;''')
attempt = sql(f"select id from public.quiz_attempts where app_user_id='{u3}';")
stamp = 'b1300000-0000-4000-8000-000000000001'
quiz = f"set application_name='t2-real-quiz';select public.submit_owned_quiz_attempt('{u3}','{attempt}','{stamp}','byus:passport:v1:{u3}:t2-upper-rpc','0x'||repeat('b',64),'byus:stamp:v1:{stamp}','0x'||repeat('c',64));"
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    submitting = pool.submit(run, quiz)
    wait_barrier(['t2-real-quiz'], 1)
    posting = pool.submit(run, post(u3, 't2-quiz-owner-post'))
    results = [submitting.result(), posting.result()]
print('ACTUAL_QUIZ_VS_POST_RPC', json.dumps(results), flush=True)
if red:
    assert any('deadlock detected' in r['err'] for r in results), 'Quiz/user-advisory inversion not reproduced'
else:
    assert all(r['code'] == 0 for r in results), 'Actual quiz/post RPC deadlock'
    assert sql(f"select count(*) from public.quiz_passes where app_user_id='{u3}' and celebrity_id='{c}';") == '1'
    assert sql(f"select count(*) from public.fan_posts where app_user_id='{u3}' and celebrity_id='{c}';") == '1'
    assert sql(f"select count(*) from public.fan_ticket_activity_awards where app_user_id='{u3}' and celebrity_id='{c}';") == '2'
sql('drop trigger t2_pause_real_quiz on public.quiz_attempts;drop function public.t2_pause_real_quiz();')
print('RED actual post/quiz lock inversions reproduced' if red else 'PASS actual two-owner posts and actual same-owner quiz/post RPCs; one reward per source')

if not red:
    # Exercise the other real creator-FOR-SHARE caller with ready, owned media.
    for owner, suffix in [(u1, '2'), (u2, '3')]:
        sql(f"select public.start_owned_quiz_attempt('{owner}','t2-upper-rpc',extensions.gen_random_uuid());")
        sql(f'''do $$declare answer record;begin
        for answer in select a.id attempt_id,qs.id question_id,o.id option_id from public.quiz_attempts a join public.quiz_attempt_questions qs on qs.attempt_id=a.id join public.quiz_attempt_options o on o.attempt_question_id=qs.id and o.is_correct where a.app_user_id='{owner}' loop
         perform public.save_owned_quiz_answer_v2('{owner}',answer.attempt_id,answer.question_id,answer.option_id,null);
        end loop;end $$;''')
        a = sql(f"select id from public.quiz_attempts where app_user_id='{owner}';")
        st = 'b1300000-0000-4000-8000-00000000000' + suffix
        sql(f"select public.submit_owned_quiz_attempt('{owner}','{a}','{st}','byus:passport:v1:{owner}:t2-upper-rpc','0x'||repeat('{suffix}',64),'byus:stamp:v1:{st}','0x'||repeat('{suffix}',64));")
    sql(f'''begin;
    insert into public.admin_allowlist(id,email,role,active)values('b1400000-0000-4000-8000-000000000001','t2-rpc-3@example.test','admin',true);
    do $$declare p uuid;begin
     p:=(public.create_admin_mobile_content_clip_reward_policy('{u3}','b1400000-0000-4000-8000-000000000001','{c}','rpc-clip-fixture',3,'동시 실제 클립 검증 정책입니다.',extensions.gen_random_uuid())->>'policyId')::uuid;
     perform public.set_admin_mobile_content_clip_reward_policy_enabled('{u3}','b1400000-0000-4000-8000-000000000001',p,true,'동시 실제 클립 검증을 진행합니다.',extensions.gen_random_uuid());
    end $$;
    create function public.t2_pause_real_clip() returns trigger language plpgsql as $$begin perform pg_sleep(2);return new;end $$;
    create trigger t2_pause_real_clip before insert on public.fan_clips for each row execute function public.t2_pause_real_clip();
    commit;''')
    assets = []
    for owner in [u1, u2]:
        asset = json.loads(sql(f"select public.reserve_owned_mobile_media('{owner}','image','fan_clip','image/jpeg',100,extensions.gen_random_uuid());"))['assetId']
        sql(f"select public.queue_owned_mobile_media_validation('{owner}','{asset}');")
        job = json.loads(sql(f"select public.claim_mobile_media_validation('{asset}');"))
        sql(f"select public.finish_mobile_media_validation('{asset}',{job['assetVersion']},'{job['jobId']}','image/jpeg',390,390,null);")
        assets.append(asset)
    def clip(owner, asset, name):
        return f"set application_name='{name}';select public.create_mobile_content_fan_clip('{owner}','t2-upper-rpc','Concurrent actual clip','public',array['{asset}'::uuid],extensions.gen_random_uuid());"
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        one = pool.submit(run, clip(u1, assets[0], 't2-real-clip-one'))
        two = pool.submit(run, clip(u2, assets[1], 't2-real-clip-two'))
        wait_barrier(['t2-real-clip-one', 't2-real-clip-two'], 2)
        results = [one.result(), two.result()]
    print('ACTUAL_TWO_OWNER_CLIP_RPC', json.dumps(results), flush=True)
    assert all(r['code'] == 0 and json.loads(r['out'].splitlines()[-1])['reward']['ticketAmount'] == 3 for r in results), results
    assert sql(f"select count(*) from public.mobile_content_clip_reward_awards where celebrity_id='{c}' and app_user_id in('{u1}','{u2}');") == '2'
    sql('drop trigger t2_pause_real_clip on public.fan_clips;drop function public.t2_pause_real_clip();')
    print('PASS actual two-owner clip RPCs: owned media attached, one configured legacy reward each')

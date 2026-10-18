"""Disposable PostgreSQL tests of real producer transactions and the shared wallet fence."""
import concurrent.futures
import json
import os
import subprocess
import uuid

if os.environ.get('PGDATABASE') != 'byus_clean' or not os.environ.get('PGHOST', '').startswith('/'):
    raise SystemExit('Disposable Unixsocket byus_clean required')


def sql(statement, allow=False):
    result = subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement,
                            text=True, capture_output=True,
                            env={**os.environ, 'PGOPTIONS': '-c lock_timeout=10s -c statement_timeout=20s'})
    if result.returncode and not allow:
        raise RuntimeError(result.stderr)
    return result


def pair(first, second):
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(sql, [first, second]))
    assert all(r.returncode == 0 for r in results)


owner, author, creator = [str(uuid.uuid4()) for _ in range(3)]
posts = [str(uuid.uuid4()) for _ in range(7)]
rules = dict(verification=100, reaction=2, comment=10, checkin=100, certification=30,
             membership_instagram=50, membership_tiktok=50, membership_youtube=50, share=10,
             live_reservation=10, live_attendance=50, mission_completion=30, first_clip=100,
             journey_completion=20, invitation_milestone=200)
lifetime = {'verification', 'membership_instagram', 'membership_tiktok', 'membership_youtube',
            'first_clip', 'invitation_milestone'}
caps = [{'key': key, 'scope': 'lifetime' if key in lifetime else 'daily',
         'dailyLimit': None if key in lifetime else 5 if key == 'reaction' else 2 if key == 'comment' else 1,
         'lifetimeLimit': (5 if key == 'invitation_milestone' else 1) if key in lifetime else None}
        for key in rules]


def activate(version):
    return f"select public.activate_mobile_fan_earning_v2('{creator}','{version}','{json.dumps(rules)}','{json.dumps(caps)}');"


fixture = f"""begin;
insert into public.app_users(id,privy_user_id,verified_email)values
('{owner}','did:privy:earning-race-owner','earning-race-owner@example.test'),
('{author}','did:privy:earning-race-author','earning-race-author@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
('{creator}','earning-races','published','/fixture.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
select '{creator}',locale,'Fixture','Fixture','Fixture'from unnest(enum_range(null::public.content_locale))locale;
"""
for i, post in enumerate(posts):
    fixture += f"""insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible)
values('{post}','{creator}','{author}','Race post{i}','{uuid.uuid4()}',repeat('a',64),false);"""
fixture += 'commit;'
sql(fixture)
sql(activate('race-v2'))


def like(post):
    return f"begin;select public.fan_web_lock_active_user('{owner}');insert into public.fan_post_likes(post_id,app_user_id)values('{post}','{owner}')on conflict do nothing;commit;"


def comment(body):
    return f"begin;select public.fan_web_lock_active_user('{owner}');insert into public.fan_lounge_messages(celebrity_id,app_user_id,body,idempotency_key)values('{creator}','{owner}','{body}','{uuid.uuid4()}');commit;"


for post in posts[:4]:
    sql(like(post))
pair(like(posts[4]), like(posts[5]))
assert sql(f"select count(*)from public.mobile_fan_activity_decisions where app_user_id='{owner}'and action_key='reaction'and decision='awarded';").stdout.strip() == '5'
assert sql(f"select count(*)from public.mobile_fan_activity_decisions where app_user_id='{owner}'and action_key='reaction'and decision='daily_limit';").stdout.strip() == '1'
pair(like(posts[4]), like(posts[4]))
assert sql(f"select public.mobile_fan_economy_balance('{owner}','{creator}','fan_point');").stdout.strip() == '10'
pair(comment('Same normalized body'), comment(' SAME   normalized body '))
assert sql(f"select count(*)from public.mobile_fan_activity_decisions where app_user_id='{owner}'and action_key='comment'and decision='awarded';").stdout.strip() == '1'
assert sql(f"select count(*)from public.mobile_fan_activity_decisions where app_user_id='{owner}'and action_key='comment'and decision='duplicate';").stdout.strip() == '1'
pair(comment('Different comment two'), comment('Different comment three'))
assert sql(f"select count(*)from public.mobile_fan_activity_decisions where app_user_id='{owner}'and action_key='comment'and decision='awarded';").stdout.strip() == '2'
pair(activate('race-v3'), like(posts[6]))
assert sql(f"select public.mobile_fan_economy_balance('{owner}','{creator}','fan_point');").stdout.strip() == '30'
assert sql("set role authenticated;select public.read_owned_mobile_fan_earning_status('" + owner + "','earning-races');", True).returncode != 0
assert sql("set role service_role;insert into public.mobile_fan_activity_sources(source_id)values('" + str(uuid.uuid4()) + "');", True).returncode != 0
assert sql(f"update public.mobile_fan_activity_decisions set decision='awarded'where app_user_id='{owner}';", True).returncode != 0
print('PASS races: likes final5/6, same-source retry, duplicate comment, comment final2/3, activation/producer fence, no cap reset; ACL and immutable decisions')

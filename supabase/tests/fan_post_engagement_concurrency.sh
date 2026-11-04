#!/usr/bin/env bash
# Disposable latest-chain database only. Run: bash scripts/verify-clean-migration-chain.sh with
# BYUS_CLEAN_DB_SHELL_ASSERTION_FILE pointing at this file.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${BYUS_POST_ENGAGEMENT_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55531}" BYUS_POST_ENGAGEMENT_MODE=1 \
    BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/fan_post_engagement_concurrency.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Refusing non-disposable database" >&2; exit 1
fi
python3 -I - <<'PY'
import concurrent.futures
import subprocess
import uuid

base = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq']
def sql(statement):
    return subprocess.check_output(base + ['-c', statement], text=True, stderr=subprocess.STDOUT).strip()
def try_sql(statement):
    p = subprocess.run(base + ['-c', statement], text=True, capture_output=True)
    return p.returncode, (p.stdout + p.stderr).strip()

OWNER = 'ac270000-0000-4000-8000-000000000001'
FANS = ['ac270000-0000-4000-8000-0000000000%02d' % i for i in range(10, 18)]
ARTIST = 'ac270000-0000-4000-8000-000000000004'
sql(f"insert into public.app_users(id,privy_user_id,verified_email) values('{OWNER}','did:privy:eng-owner','eng-owner@example.test')")
for i, f in enumerate(FANS):
    sql(f"insert into public.app_users(id,privy_user_id,verified_email) values('{f}','did:privy:eng-{i}','eng-{i}@example.test')")
sql(f"""
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
 values('{ARTIST}','eng-qa','published','/images/creator.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 values('{ARTIST}','ko','검사','소개','사진'),('{ARTIST}','en','QA','Summary','Photo');""")
post = sql(f"select (public.save_fan_post('{OWNER}','eng-qa',null,'Engagement post','public','{{}}',null,extensions.gen_random_uuid())->>'id')")
def counts(viewer=None):
    v = f"'{viewer}'" if viewer else 'null'
    return sql(f"select (public.read_fan_post({v},'{post}')#>>'{{post,likeCount}}')||','||(public.read_fan_post({v},'{post}')#>>'{{post,commentCount}}')")

def like(args):
    user, liked = args
    return try_sql(f"select public.set_fan_post_like('{user}','{post}',{'true' if liked else 'false'})")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    res = list(pool.map(like, [(FANS[0], True)] * 8))
assert all(rc == 0 for rc, _ in res), ('parallel same-like errored', res)
assert counts(FANS[1]).startswith('1,'), ('double-click like not idempotent', counts(FANS[1]))
print('PASS: 8 parallel identical like requests from one user yield likeCount=1')

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    res = list(pool.map(like, [(f, True) for f in FANS]))
assert all(rc == 0 for rc, _ in res), ('parallel multi-user like errored', res)
assert counts(OWNER).startswith(f'{len(FANS)},'), ('multi-user like count', counts(OWNER))
print('PASS: concurrent likes from distinct users are all counted exactly once')

sql(f"delete from public.fan_post_likes where post_id='{post}'")
seq = [(FANS[0], i % 2 == 0) for i in range(10)]
for s in seq:
    like(s)
assert counts(FANS[1]).startswith('0,'), ('sequential toggle count', counts(FANS[1]))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    res = list(pool.map(like, seq))
n = int(counts(FANS[1]).split(',')[0])
assert n in (0, 1), ('toggle race produced impossible count', n)
rows = int(sql(f"select count(*) from public.fan_post_likes where post_id='{post}' and app_user_id='{FANS[0]}'"))
assert rows == n, ('count/row mismatch', rows, n)
print(f'PASS: racing like/unlike toggles keep likeCount in 0..1 (final {n})')

key = str(uuid.uuid4())
def comment(args):
    user, body, k = args
    return try_sql(f"select public.post_fan_post_comment('{user}','{post}',null,'{body}','{k}')")
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    res = list(pool.map(comment, [(FANS[0], 'same key', key)] * 6))
assert all(rc == 0 for rc, _ in res), ('parallel same-key comment errored', res)
c = sql(f"select count(*) from public.fan_post_comments where post_id='{post}' and app_user_id='{FANS[0]}'")
assert c == '1', ('same idempotency key created duplicates', c)
print('PASS: 6 parallel comment posts with one idempotency key create one comment')

rc, out = comment((FANS[0], 'other body', key))
assert rc != 0 and 'FAN_WEB_CONFLICT' in out, ('key reuse with different body', rc, out)
print('PASS: idempotency key reuse with a different body is rejected')

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    res = list(pool.map(comment, [(f, f'hello {i}', str(uuid.uuid4())) for i, f in enumerate(FANS)]))
assert all(rc == 0 for rc, _ in res), ('multi-user comments errored', res)
cc = int(counts(OWNER).split(',')[1])
assert cc == 1 + len(FANS), ('commentCount mismatch', cc)
print('PASS: concurrent comments from distinct users are all counted')

cid = sql(f"select id from public.fan_post_comments where post_id='{post}' and app_user_id='{FANS[1]}' limit 1")
def rm(_):
    return try_sql(f"select public.remove_fan_post_comment('{FANS[1]}','{cid}')")
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    res = list(pool.map(rm, range(4)))
cc2 = int(counts(OWNER).split(',')[1])
assert cc2 == cc - 1, ('double delete changed count by more than 1', cc, cc2, res)
print('PASS: repeated/parallel comment delete reduces commentCount exactly once')
PY

#!/usr/bin/env bash
# Disposable latest-chain database only. Reproduces the route's cursor (createdAt string + id [+ likeCount+commentCount])
# against read_fan_posts / read_fan_post_comments while new rows arrive between page reads.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${BYUS_POST_PAGINATION_MODE:-}" != "1" ]]; then
  BYUS_CLEAN_DB_PORT="${BYUS_CLEAN_DB_PORT:-55533}" BYUS_POST_PAGINATION_MODE=1 \
    BYUS_CLEAN_DB_SHELL_ASSERTION_FILE="$ROOT_DIR/supabase/tests/fan_post_pagination.sh" \
    bash "$ROOT_DIR/scripts/verify-clean-migration-chain.sh"
  exit 0
fi
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != "byus_clean" || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
  echo "Refusing non-disposable database" >&2; exit 1
fi
python3 -I - <<'PY'
import json
import subprocess
import uuid

base = ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq']
def sql(statement):
    return subprocess.check_output(base + ['-c', statement], text=True, stderr=subprocess.STDOUT).strip()
def j(statement):
    return json.loads(sql(statement))

U = ['ac280000-0000-4000-8000-0000000000%02d' % i for i in range(1, 6)]
ARTIST = 'ac280000-0000-4000-8000-000000000099'
for i, u in enumerate(U):
    sql(f"insert into public.app_users(id,privy_user_id,verified_email) values('{u}','did:privy:pg-{i}','pg-{i}@example.test')")
sql(f"""
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
 values('{ARTIST}','pg-qa','published','/images/creator.webp',now(),'{{creator}}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 values('{ARTIST}','ko','검사','소개','사진'),('{ARTIST}','en','QA','Summary','Photo');""")

def new_post(n):
    return sql(f"select public.save_fan_post('{U[0]}','pg-qa',null,'post {n}','public','{{}}',null,extensions.gen_random_uuid())->>'id'")

def posts(sort, cursor=None, limit=2):
    before = f"'{cursor['at']}'::timestamptz" if cursor else 'null'
    bid = f"'{cursor['id']}'" if cursor else 'null'
    score = cursor.get('score') if cursor else None
    score = 'null' if score is None else str(score)
    return j(f"select public.read_fan_posts('{U[1]}','pg-qa',{before},{bid},{score},'{sort}',{limit},'ko')::text")

def cursor_of(page, sort):
    last = page['items'][-1]
    c = {'at': last['createdAt'], 'id': last['id']}
    if sort == 'popular':
        c['score'] = last['likeCount'] + last['commentCount']
    return c

# Latest: seed 6 posts, read page 1, insert two new posts, then read all remaining pages.
ids = [new_post(i) for i in range(6)]
p1 = posts('latest')
seen = [x['id'] for x in p1['items']]
new_ids = [new_post(100 + i) for i in range(2)]
cur = cursor_of(p1, 'latest')
has_more = p1['hasMore']
while has_more:
    pg = posts('latest', cur)
    seen += [x['id'] for x in pg['items']]
    has_more = pg['hasMore']
    if pg['items']:
        cur = cursor_of(pg, 'latest')
assert len(seen) == len(set(seen)), ('latest cursor produced duplicates', seen)
assert set(seen) == set(ids), ('latest cursor missed older posts', set(ids) - set(seen))
assert not set(new_ids) & set(seen), 'new posts must not appear in deeper pages'
print('PASS: latest feed cursor has no duplicates or gaps while new posts arrive between page reads')

# Cursor precision: createdAt text from the API must equal the stored microsecond value.
row = sql(f"select count(*) from public.fan_posts where celebrity_id='{ARTIST}'")
all_latest = []
cur, more = None, True
while more:
    pg = posts('latest', cur, 3)
    all_latest += [x['id'] for x in pg['items']]
    more = pg['hasMore']
    if pg['items']:
        cur = cursor_of(pg, 'latest')
assert len(all_latest) == len(set(all_latest)) == int(row), ('limit=3 walk mismatch', len(all_latest), row)
print('PASS: full walk with limit 3 returns every post exactly once')

# Popular: viewer-visible score must equal likeCount+commentCount used in the route cursor (replies included).
p_top = ids[2]
c = sql(f"select public.post_fan_post_comment('{U[2]}','{p_top}',null,'c1',extensions.gen_random_uuid())->>'id'")
sql(f"select public.post_fan_post_comment('{U[3]}','{p_top}','{c}','reply',extensions.gen_random_uuid())")
sql(f"select public.set_fan_post_like('{U[3]}','{p_top}',true)")
p1 = posts('popular')
assert p1['items'][0]['id'] == p_top, ('popular order', [x['id'] for x in p1['items']])
top = p1['items'][0]
engagement = sql(f"select count(*) from public.fan_post_likes where post_id='{p_top}'")
assert top['likeCount'] + top['commentCount'] == 1 + 2, ('route score differs from SQL engagement', top['likeCount'], top['commentCount'])
seen = [x['id'] for x in p1['items']]
cur, more = cursor_of(p1, 'popular'), p1['hasMore']
while more:
    pg = posts('popular', cur)
    seen += [x['id'] for x in pg['items']]
    more = pg['hasMore']
    if pg['items']:
        cur = cursor_of(pg, 'popular')
total = int(row)
assert len(seen) == len(set(seen)) == total, ('popular walk (static data) dup/gap', len(seen), len(set(seen)), total)
print('PASS: popular feed cursor score matches SQL engagement; static walk has no duplicates or gaps')

# Popular drift: a post already further down is liked after page 1 was read -> it can be skipped. Documented, not asserted.
# Comments: newest first; a comment added between page reads must not duplicate or skip older comments.
post = ids[0]
cm = [sql(f"select public.post_fan_post_comment('{U[1]}','{post}',null,'m{i}',extensions.gen_random_uuid())->>'id'") for i in range(5)]
def comments(cursor=None, limit=2):
    before = f"'{cursor['at']}'::timestamptz" if cursor else 'null'
    bid = f"'{cursor['id']}'" if cursor else 'null'
    return j(f"select public.read_fan_post_comments('{U[1]}','{post}',{before},{bid},{limit},'ko')::text")
c1 = comments()
seen = [x['id'] for x in c1['items']]
sql(f"select public.post_fan_post_comment('{U[2]}','{post}',null,'late',extensions.gen_random_uuid())")
sql(f"select public.remove_fan_post_comment('{U[1]}','{cm[0]}')")  # deleting the oldest between reads
cur, more = {'at': c1['items'][-1]['createdAt'], 'id': c1['items'][-1]['id']}, c1['hasMore']
while more:
    pg = comments(cur)
    seen += [x['id'] for x in pg['items']]
    more = pg['hasMore']
    if pg['items']:
        cur = {'at': pg['items'][-1]['createdAt'], 'id': pg['items'][-1]['id']}
assert len(seen) == len(set(seen)), ('comment cursor duplicates', seen)
assert set(cm[1:]) <= set(seen), ('comment cursor missed live comments',)
assert cm[0] not in seen[2:], 'deleted comment still listed on later pages'
print('PASS: comment cursor has no duplicates or gaps with a new comment and a delete between reads')
PY

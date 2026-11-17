#!/usr/bin/env bash
# Batch like totals for /shorts (20261230010000) on the disposable replay database:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/shortform_like_counts.sh TMPDIR=<short dir> scripts/verify-clean-migration-chain.sh
# HOME_GALLERY_FIXTURE_DIR, when set, receives the real SQL response used by the web contract test.
set -euo pipefail
HOME_GALLERY_SETUP_ONLY=1 source "$(dirname "${BASH_SOURCE[0]}")/home_gallery_shorts.sh"
MIGRATION="$ROOT_DIR/supabase/migrations/20261230010000_shortform_like_counts_batch.sql"
ROLLBACK="$ROOT_DIR/supabase/rollback/20261230010000_shortform_like_counts_batch.sql"

# 1200 videos of the public creator C1 and 30 of the hidden creator C2; ids sv000000001 ... ; 40 members, 3 of them disabled.
run <<SQL
insert into public.home_shortform(celebrity_id, video_id, title, href, published_at)
  select case when n <= 1200 then '$C1'::uuid else '$C2'::uuid end, 'sv' || lpad(n::text, 9, '0'), '숏폼 ' || n,
         'https://www.youtube.com/watch?v=sv' || lpad(n::text, 9, '0'), now() - (n || ' minutes')::interval
    from generate_series(1, 1230) n;
insert into public.app_users(id, privy_user_id, verified_email, status)
  select ('b0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'did:privy:likes-' || n, 'likes-' || n || '@example.invalid', 'active' from generate_series(1, 40) n;
-- likes: video n gets (n mod 9) likes from the first members, plus every 5th video a dislike and every 7th video a like of a member that is disabled below
insert into public.shortform_reactions(video_id, app_user_id, reaction)
  select 'sv' || lpad(n::text, 9, '0'), ('b0000000-0000-4000-8000-' || lpad(m::text, 12, '0'))::uuid, 'like' from generate_series(1, 1230) n, generate_series(1, 40) m where m <= n % 9;
insert into public.shortform_reactions(video_id, app_user_id, reaction)
  select 'sv' || lpad(n::text, 9, '0'), 'b0000000-0000-4000-8000-000000000040'::uuid, 'dislike' from generate_series(1, 1230) n where n % 5 = 0;
insert into public.shortform_reactions(video_id, app_user_id, reaction)
  select 'sv' || lpad(n::text, 9, '0'), ('b0000000-0000-4000-8000-' || lpad((38 + n % 2)::text, 12, '0'))::uuid, 'like' from generate_series(1, 1230) n where n % 7 = 0 and (n % 9) < 1;
update public.app_users set status = 'disabled' where id in ('b0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000039');
analyze public.shortform_reactions; analyze public.home_shortform;
SQL
# 200 video ids as an array literal (service_role cannot read the table itself, so the ids are taken as the table owner)
ids200() { printf '%s::text[]' "$(q "select quote_literal(array(select video_id from public.home_shortform order by video_id offset $1 limit 200)::text)")"; }

# L-1 same totals as the single read for every public video, in batches covering the 1200 (and the 30 of the hidden creator)
for offset in 0 200 400 600 800 1000 1200; do
  eq "$(sq "select count(*) from jsonb_each(public.read_public_shortform_like_counts($(ids200 $offset))) e where (public.read_shortform_participation(e.key, null)->>'likeCount')::int is distinct from e.value::text::int")" 0 "L-1 batch at $offset equals read_shortform_participation"
done
eq "$(sq "select (select count(*) from jsonb_object_keys(public.read_public_shortform_like_counts($(ids200 0))))")" 200 'L-1 every public video of the batch has an entry'
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000004'])")" '{"sv000000004": 4}' 'L-1 one video: 4 likes (4 mod 9)'
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000007'])")" '{"sv000000007": 7}' 'L-1 one video: 7 likes'
eq "$(q "select count(*) from public.shortform_reactions r join public.app_users u on u.id = r.app_user_id where r.video_id = 'sv000000063' and r.reaction = 'like' and u.status = 'disabled'")" 1 'L-1 (setup) video 63 has a like of a disabled member'
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000063'])")" '{"sv000000063": 0}' 'L-1 a like of a disabled member is not counted'
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000009'])")" '{"sv000000009": 0}' 'L-1 a video with no likes is 0, present'
eq "$(sq "select (public.read_public_shortform_like_counts(array['sv000000005']) ->> 'sv000000005')")" 5 'L-1 a dislike is not a like'

# L-2 not public: a video of a creator that is not public, and an id that is no video, are left out (the single read answers null for them)
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000001201','sv000001230','nonexistent1'])")" '{}' 'L-2 hidden creator and unknown ids are left out'
eq "$(sq "select public.read_shortform_participation('sv000001201', null) is null")" t 'L-2 (the single read also treats the hidden creator as not public)'
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000004','sv000000004','sv000001201'])")" '{"sv000000004": 4}' 'L-2 duplicates collapse'

# L-3 limits and permissions
expect_fail L-3 'invalid shortform like batch' "set role service_role; select public.read_public_shortform_like_counts(array[]::text[])"
expect_fail L-3 'invalid shortform like batch' "set role service_role; select public.read_public_shortform_like_counts(null)"
expect_fail L-3 'invalid shortform like batch' "set role service_role; select public.read_public_shortform_like_counts($(ids200 0) || 'x'::text)"
for role in anon authenticated; do
  expect_fail L-3 'permission denied' "set role $role; select public.read_public_shortform_like_counts(array['sv000000004'])"
done
eq "$(sq "select count(*) from jsonb_object_keys(public.read_public_shortform_like_counts($(ids200 0)))")" 200 'L-3 200 ids are accepted'
# nothing about a member is in the answer: only video ids and counts
eq "$(sq "select count(*) from jsonb_each(public.read_public_shortform_like_counts($(ids200 0))) e where jsonb_typeof(e.value) <> 'number' or e.key !~ '^sv[0-9]{9}$'")" 0 'L-3 only video id → number'

if [[ -n "${HOME_GALLERY_FIXTURE_DIR:-}" ]]; then
  # Real answer for the web contract test: two public videos (4 likes, none) and one of a hidden creator (left out).
  sq "select jsonb_pretty(public.read_public_shortform_like_counts(array['sv000000004','sv000000009','sv000001201']))" > "$HOME_GALLERY_FIXTURE_DIR/read_public_shortform_like_counts.json"
fi

# L-4 plan of the aggregate for 200 ids out of 1200 videos with about 4000 reactions (printed, not asserted)
echo '--- EXPLAIN (ANALYZE, BUFFERS) of the aggregate for 200 ids'
psql -X -q -v ON_ERROR_STOP=1 <<SQL
explain (analyze, buffers, costs off, summary on)
select jsonb_object_agg(s.video_id, coalesce(l.likes, 0))
  from public.home_shortform s
  left join (select r.video_id, count(*) likes from public.shortform_reactions r join public.app_users u on u.id = r.app_user_id and u.status = 'active'
              where r.reaction = 'like' and r.video_id = any ($(ids200 0)) group by r.video_id) l on l.video_id = s.video_id
 where s.video_id = any ($(ids200 0)) and public.home_gallery_creator_public(s.celebrity_id);
SQL
echo "--- single reads for comparison: 200 calls of read_shortform_participation"
psql -X -q -v ON_ERROR_STOP=1 -c "\\timing on" -c "set role service_role; select count(public.read_shortform_participation(v, null)) from unnest($(ids200 0)) v" -c "select count(*) from jsonb_object_keys(public.read_public_shortform_like_counts($(ids200 0)))"

# O-1 the owner guard
run -c "create role likes_test_owner nologin nobypassrls; grant usage, create on schema public to likes_test_owner; alter function public.read_public_shortform_like_counts(text[]) owner to likes_test_owner"
if out="$(awk '/^do \$owner\$/{on=1} on{print} /^\$owner\$;/{on=0}' "$MIGRATION" | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL O-1 different owner accepted' >&2; exit 1; fi
[[ "$out" == *SHORTFORM_LIKE_COUNTS_OWNER_GAP* ]] || { echo "$out" >&2; exit 1; }
pass O-1 'a new read with another owner than read_shortform_participation stops the migration'
run -c "alter function public.read_public_shortform_like_counts(text[]) owner to current_user"

# R-1 rollback and re-apply
run -f "$ROLLBACK"
eq "$(q "select to_regprocedure('public.read_public_shortform_like_counts(text[])') is null")" t 'R-1 rollback drops the batch read'
eq "$(sq "select (public.read_shortform_participation('sv000000004', null)->>'likeCount')::int")" 4 'R-1 the single read untouched'
run -f "$MIGRATION"
eq "$(sq "select public.read_public_shortform_like_counts(array['sv000000004'])")" '{"sv000000004": 4}' 'R-1 re-applied'
echo 'PASS shortform_like_counts: totals equal the single read for 1200 videos, non-public left out, limits, permissions, owner guard, rollback/reapply'

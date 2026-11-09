#!/usr/bin/env bash
# METRICS-WEEKLY (20261220070000): read_admin_weekly_metrics counts from the existing sources only.
#   Part 1 (superuser, one transaction, rolled back): eight KST weeks Monday-Sunday, the current one in progress; signups, active members,
#     posts, comments, points and hearts change by exactly the fixture rows of a real week; test accounts, unlisted pages/creators, hidden,
#     deleted and removed rows, negative points and other assets add nothing; week boundaries (Sunday end / Monday start) land in the right week;
#     the cumulative column equals a direct count; the answer holds no identifier; admin and read-only admin read, a member and an inactive admin
#     are refused; clients cannot execute it and its owner can read every table it reads (has_table_privilege).
#   Part 2: the migration applied by a role shaped like dev's byus_admin (no superuser, no BYPASSRLS, member of the local owner) gives the same
#     answer as the superuser; a role that cannot read stops the file with METRICS_WEEKLY_OWNER_GAP; the rollback removes the function and the
#     policy and time-led indexes the migration made, and a second rollback is a no-op.
# Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: byus. Nothing is kept.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$1"; }
strip "$ROOT/supabase/migrations/20261220070000_admin_weekly_metrics.sql" > "$TMP/migration.sql"
strip "$ROOT/supabase/rollback/20261220070000_admin_weekly_metrics.sql" > "$TMP/rollback.sql"
# The gap probe is a role that owns nothing, so it cannot build indexes either; the file without that block reaches the owner check.
sed '/-- indexes-begin/,/-- indexes-end/d' "$TMP/migration.sql" > "$TMP/migration-no-indexes.sql"
DB="${PGDATABASE:-byus}"

# Fixtures shared by both parts: a function that inserts them and a function that checks the answer against the baseline taken before.
cat > "$TMP/fixtures.sql" <<'SQL'
create temp table mw_ids as select
  gen_random_uuid() admin_user, gen_random_uuid() admin_allow, gen_random_uuid() viewer_user, gen_random_uuid() viewer_allow,
  gen_random_uuid() member_user, gen_random_uuid() off_user, gen_random_uuid() off_allow,
  gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() e, 'd2611001-0000-4000-8000-0000000fffb1'::uuid decoy, gen_random_uuid() decoy_mail,
  gen_random_uuid() s1, gen_random_uuid() s2, gen_random_uuid() t1, 'f1610000-0000-4000-8000-0000000fffa1'::uuid t2, 'd2611001-0000-4000-8000-0000000fffa1'::uuid t3,
  gen_random_uuid() c1, gen_random_uuid() c2, gen_random_uuid() g1, gen_random_uuid() g2;
grant all on mw_ids to public;
create temp table mw_base(result jsonb);

create function pg_temp.mw_admins() returns void language plpgsql as $$
declare i mw_ids; old timestamptz := (date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul') - interval '30 weeks') at time zone 'Asia/Seoul';
begin
  select * into i from mw_ids;
  insert into public.app_users(id, privy_user_id, verified_email, created_at) values
    (i.admin_user, 'did:privy:mw-admin', 'mw-admin@byus.test', old), (i.viewer_user, 'did:privy:mw-viewer', 'mw-viewer@byus.test', old),
    (i.member_user, 'did:privy:mw-member', 'mw-member@byus.test', old), (i.off_user, 'did:privy:mw-off', 'mw-off@byus.test', old),
    (i.e, 'did:privy:mw-e', 'mw-e@byus.test', old);
  insert into public.admin_allowlist(id, email, role, active) values
    (i.admin_allow, 'mw-admin@byus.test', 'admin', true), (i.viewer_allow, 'mw-viewer@byus.test', 'viewer', true),
    (i.off_allow, 'mw-off@byus.test', 'viewer', false);
end $$;

create function pg_temp.mw_users() returns void language plpgsql as $$
declare i mw_ids; this_week timestamp := date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul');
  lw timestamptz := (date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul') - interval '1 week' + interval '2 days 10 hours') at time zone 'Asia/Seoul';
begin
  select * into i from mw_ids;
  insert into public.app_users(id, privy_user_id, verified_email, created_at) values
    -- Real members that signed up last week (four; the decoy has a fixture-looking id but an ordinary privy id) and the two boundary members.
    (i.a, 'did:privy:mw-a', 'mw-a@byus.test', lw), (i.b, 'did:privy:mw-b', 'mw-b@byus.test', lw + interval '1 hour'),
    (i.decoy, 'did:privy:mw-decoy', 'mw-decoy@byus.test', lw + interval '2 hours'),
    (i.decoy_mail, 'did:privy:mw-decoy-mail', 'test-real-person@example.com', lw + interval '3 hours'),
    (i.s1, 'did:privy:mw-s1', 'mw-s1@byus.test', (this_week at time zone 'Asia/Seoul') - interval '1 microsecond'),
    (i.s2, 'did:privy:mw-s2', 'mw-s2@byus.test', (this_week at time zone 'Asia/Seoul')),
    -- Test accounts, by the three DEV-TIDY 4 rules.
    (i.t1, 'did:privy:mw-t1', 'test-9001@privy.io', lw), (i.t2, 'did:privy:mw-t2', 'mw-t2@byus.test', lw),
    (i.t3, 'fixture:doc-261107:mw', 'mw-t3@byus.test', lw);
end $$;

create function pg_temp.mw_rows() returns void language plpgsql as $$
declare i mw_ids; lw timestamptz := (date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul') - interval '1 week' + interval '2 days 10 hours') at time zone 'Asia/Seoul';
  tw timestamptz := (date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul') + interval '1 hour') at time zone 'Asia/Seoul';
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid(); p4 uuid := gen_random_uuid(); p5 uuid := gen_random_uuid(); p6 uuid := gen_random_uuid();
  gp1 uuid := gen_random_uuid(); gp2 uuid := gen_random_uuid(); gp3 uuid := gen_random_uuid(); gp4 uuid := gen_random_uuid(); n int := 0;
begin
  select * into i from mw_ids;
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values
    (i.c1, 'mw-listed-' || i.c1, 'published', '/fixture.webp', now(), '{creator}', 'creator'),
    (i.c2, 'mw-test-' || i.c2, 'published', '/fixture.webp', now(), '{creator}', 'creator');
  insert into public.group_pages(id, kind, celebrity_id, name, listed) values
    (i.g1, 'hobby', null, 'mw listed group', true), (i.g2, 'hobby', null, 'mw test group', false);
  insert into public.group_pages(kind, celebrity_id, name, listed) values ('fan', i.c2, 'mw test creator page', false);

  -- posts: counted +1 (A on listed creator), the rest add nothing
  insert into public.fan_posts(id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash, created_at, hidden_at, deleted_at) values
    (p1, i.c1, i.a, 'mw', gen_random_uuid(), repeat('0', 64), lw, null, null),
    (p2, i.c2, i.a, 'mw unlisted creator', gen_random_uuid(), repeat('0', 64), lw, null, null),
    (p3, i.c1, i.t1, 'mw test account', gen_random_uuid(), repeat('0', 64), lw, null, null),
    (p4, i.c1, i.a, 'mw hidden', gen_random_uuid(), repeat('0', 64), lw, lw, null),
    (p5, i.c1, i.a, 'mw deleted', gen_random_uuid(), repeat('0', 64), lw, null, lw);
  insert into public.group_posts(id, page_id, author_id, title, body, visibility, anonymous, created_at, removed_at) values
    (gp1, i.g1, i.a, 'mw', 'mw', 'public', false, lw, null),
    (gp2, i.g2, i.a, 'mw unlisted page', 'mw', 'public', false, lw, null),
    (gp3, i.g1, i.a, 'mw removed', 'mw', 'public', false, lw, lw),
    (gp4, i.g2, i.decoy, 'mw decoy on test page', 'mw', 'public', false, lw, null);
  -- comments: A on own listed post (+1), on the unlisted creator's post, T1, hidden; B on listed group post (+1), on test group post
  insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key, created_at, hidden_at) values
    (p1, i.a, 'mw', gen_random_uuid(), lw, null), (p2, i.a, 'mw unlisted', gen_random_uuid(), lw, null),
    (p1, i.t1, 'mw test account', gen_random_uuid(), lw, null), (p1, i.a, 'mw hidden', gen_random_uuid(), lw, lw);
  insert into public.group_comments(post_id, author_id, body, anonymous, created_at) values
    (gp1, i.b, 'mw', false, lw), (gp2, i.b, 'mw test page', false, lw);
  -- active: B has a signed-in screen view; E only a system ledger event; the decoy only an event on the test creator
  insert into public.fan_product_events(schema_version, event_name, app_user_id, source, idempotency_key, occurred_at, created_at) values
    (1, 'creator_page_view', i.b, 'mw.test', 'mw-' || gen_random_uuid(), lw, lw),
    (1, 'ticket_credited', i.e, 'mw.test', 'mw-' || gen_random_uuid(), lw, lw),
    (1, 'creator_page_view', i.t1, 'mw.test', 'mw-' || gen_random_uuid(), lw, lw);
  insert into public.fan_product_events(schema_version, event_name, app_user_id, celebrity_id, source, idempotency_key, occurred_at, created_at) values
    (1, 'creator_page_view', i.decoy, i.c2, 'mw.test', 'mw-' || gen_random_uuid(), lw, lw);
  -- points: +50 group wallet A, +7 B on listed creator; not counted: -20, test account, unlisted creator, other asset. This week: +3.
  insert into public.mobile_fan_economy_ledger(app_user_id, celebrity_id, asset, amount, source_type, source_id, policy_id, group_policy_version, owner_sequence, resulting_balance, created_at)
    select u, c, asset, amount, 'mw_fixture', gen_random_uuid(), case when c is null then null else gen_random_uuid() end,
      case when c is null then 'mw-fixture' end, 9000 + row_number() over (), 1000, at
    from (values (i.a, null::uuid, 'fan_point', 50, lw), (i.a, null, 'fan_point', -20, lw), (i.t1, null, 'fan_point', 30, lw),
      (i.a, i.c2, 'fan_point', 10, lw), (i.a, i.c1, 'free_vote', 5, lw), (i.b, i.c1, 'fan_point', 7, lw), (i.a, null, 'fan_point', 3, tw)) v(u, c, asset, amount, at);
  -- hearts: A on listed creator +1, plus a conversion of 4; not counted: unlisted creator, test account
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at) values
    (i.c1, i.a, 1, 'passport_page_claim', gen_random_uuid(), lw), (i.c2, i.a, 1, 'passport_page_claim', gen_random_uuid(), lw),
    (i.c1, i.t1, 1, 'passport_page_claim', gen_random_uuid(), lw);
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at, converted_at) values
    (i.a, i.c1, 36, 4, 0, lw, lw), (i.a, i.c2, 36, 9, 0, lw, lw);
end $$;
SQL

echo "== part 1: counts, exclusions, boundaries, permissions =="
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
begin;
\i $TMP/migration.sql
\i $TMP/fixtures.sql
set local session_replication_role = replica;
select pg_temp.mw_admins();
set local session_replication_role = origin;
-- Baseline: the answer with the admins and the old members in place but none of the fixture rows.
insert into mw_base select public.read_admin_weekly_metrics((select admin_user from mw_ids), (select admin_allow from mw_ids));
set local session_replication_role = replica;
select pg_temp.mw_users();
select pg_temp.mw_rows();
set local session_replication_role = origin;

do \$\$
declare i mw_ids; base jsonb; after jsonb; viewer jsonb; w jsonb; b jsonb; k text; direct bigint; thrown boolean; msg text; prev bigint; idx int;
  tw date := (date_trunc('week', statement_timestamp() at time zone 'Asia/Seoul'))::date;
  need text[] := array['weekStart','weekEnd','inProgress','signups','activeMembers','posts','comments','pointsGranted','heartsGranted','cumulativeSignups'];
  delta bigint[];
begin
  select * into i from mw_ids; select result into base from mw_base;
  after := public.read_admin_weekly_metrics(i.admin_user, i.admin_allow);

  -- Shape: eight Monday-Sunday weeks, the last in progress, only the agreed keys, counts only.
  if jsonb_array_length(after->'weeks') <> 8 or after->>'timezone' <> 'Asia/Seoul' then raise exception 'MW_SHAPE: eight KST weeks expected'; end if;
  for idx in 0..7 loop
    w := after->'weeks'->idx;
    if (select array_agg(key order by key) from jsonb_object_keys(w) key) is distinct from (select array_agg(n order by n) from unnest(need) n) then raise exception 'MW_KEYS at %: %', idx, w; end if;
    if extract(isodow from (w->>'weekStart')::date) <> 1 or (w->>'weekEnd')::date - (w->>'weekStart')::date <> 6 then raise exception 'MW_WEEK_DAYS at %', idx; end if;
    if (w->>'weekStart')::date <> tw - (7 - idx) * 7 then raise exception 'MW_WEEK_ORDER at %', idx; end if;
    if (w->>'inProgress')::boolean <> (idx = 7) then raise exception 'MW_IN_PROGRESS at %', idx; end if;
  end loop;
  if after::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}' or after::text like '%@%' then raise exception 'MW_IDENTIFIER: the answer holds an id or an email'; end if;

  -- Deltas of last week (index 6) and this week (index 7) against the baseline.
  foreach k in array array['signups','activeMembers','posts','comments','pointsGranted','heartsGranted'] loop
    delta := array[(after->'weeks'->6->>k)::bigint - (base->'weeks'->6->>k)::bigint, (after->'weeks'->7->>k)::bigint - (base->'weeks'->7->>k)::bigint];
    raise notice '% last week +%, this week +%', k, delta[1], delta[2];
    if k = 'signups' and delta <> array[5, 1]::bigint[] then raise exception 'MW_SIGNUPS: % (4 members and the Sunday-end boundary last week, the Monday-start one this week; test accounts and the e-mail decoy rule)', delta; end if;
    if k = 'activeMembers' and delta <> array[2, 0]::bigint[] then raise exception 'MW_ACTIVE: % (A and B only: not E with a system event, not the decoy with activity on test pages, not T1)', delta; end if;
    if k = 'posts' and delta <> array[2, 0]::bigint[] then raise exception 'MW_POSTS: %', delta; end if;
    if k = 'comments' and delta <> array[2, 0]::bigint[] then raise exception 'MW_COMMENTS: %', delta; end if;
    if k = 'pointsGranted' and delta <> array[57, 3]::bigint[] then raise exception 'MW_POINTS: %', delta; end if;
    if k = 'heartsGranted' and delta <> array[5, 0]::bigint[] then raise exception 'MW_HEARTS: %', delta; end if;
  end loop;
  -- Older weeks do not move.
  for idx in 0..5 loop
    foreach k in array array['signups','activeMembers','posts','comments','pointsGranted','heartsGranted'] loop
      if after->'weeks'->idx->>k <> base->'weeks'->idx->>k then raise exception 'MW_OLD_WEEK % % moved', idx, k; end if;
    end loop;
  end loop;

  -- Cumulative: equals a direct count of non-test accounts, rises by each week's signups.
  select count(*) into direct from public.app_users u where not (u.verified_email like 'test-%@privy.io' or u.id::text like 'f1610000-0000-4000-8000-%'
    or (u.id::text like 'd2611001-0000-4000-8000-%' and u.privy_user_id like 'fixture:doc-261107:%')) or u.verified_email = 'biz@sallylab.io';
  if (after->'weeks'->7->>'cumulativeSignups')::bigint <> direct then raise exception 'MW_CUMULATIVE: % <> direct %', after->'weeks'->7->>'cumulativeSignups', direct; end if;
  for idx in 1..7 loop
    if (after->'weeks'->idx->>'cumulativeSignups')::bigint - (after->'weeks'->(idx - 1)->>'cumulativeSignups')::bigint <> (after->'weeks'->idx->>'signups')::bigint
      then raise exception 'MW_CUMULATIVE_STEP at %', idx; end if;
  end loop;

  -- Permissions.
  viewer := public.read_admin_weekly_metrics(i.viewer_user, i.viewer_allow);
  if viewer is distinct from after then raise exception 'MW_VIEWER: a read-only admin must see the same answer'; end if;
  foreach msg in array array['member','inactive','allowlist-of-other'] loop
    thrown := false;
    begin
      if msg = 'member' then perform public.read_admin_weekly_metrics(i.member_user, i.admin_allow);
      elsif msg = 'inactive' then perform public.read_admin_weekly_metrics(i.off_user, i.off_allow);
      else perform public.read_admin_weekly_metrics(i.member_user, null);
      end if;
    exception when others then thrown := sqlerrm = 'active admin required'; end;
    if not thrown then raise exception 'MW_REFUSAL: % was not refused', msg; end if;
  end loop;
  if has_function_privilege('anon', 'public.read_admin_weekly_metrics(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.read_admin_weekly_metrics(uuid,uuid)', 'execute')
     or has_function_privilege('public', 'public.read_admin_weekly_metrics(uuid,uuid)', 'execute') then raise exception 'MW_CLIENT_EXECUTE: clients can call the reader'; end if;
  if not has_function_privilege('service_role', 'public.read_admin_weekly_metrics(uuid,uuid)', 'execute') then raise exception 'MW_SERVICE_EXECUTE'; end if;
  foreach k in array array['app_users','fan_product_events','group_creator_attendance','fan_posts','fan_post_comments','fan_lounge_messages','group_posts',
      'group_comments','group_pages','mobile_fan_economy_ledger','creator_heart_ledger','fan_heart_conversions'] loop
    if not has_table_privilege((select pg_get_userbyid(proowner) from pg_proc where oid = 'public.read_admin_weekly_metrics(uuid,uuid)'::regprocedure), ('public.' || k)::regclass, 'select')
      then raise exception 'MW_OWNER_READ: owner cannot read %', k; end if;
  end loop;
  -- Every history table the report counts has an index led by its time column.
  foreach k in array array['group_creator_attendance','fan_posts','fan_post_comments','fan_lounge_messages','group_posts','group_comments',
      'mobile_fan_economy_ledger','creator_heart_ledger','fan_heart_conversions','fan_product_events','app_users'] loop
    if not exists (select 1 from pg_index ix join pg_class c on c.oid = ix.indrelid join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = ix.indkey[0]
      where c.oid = ('public.' || k)::regclass and a.attname in ('created_at', 'converted_at') and ix.indisvalid) then raise exception 'MW_INDEX: % has no time-led index', k; end if;
  end loop;
  raise notice 'part 1 ok';
end \$\$;
rollback;
SQL

echo "== part 2: applied by a role shaped like dev's byus_admin, OWNER_GAP, rollback =="
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<SQL
begin;
create role mw_apply nologin nosuperuser nobypassrls;
grant usage on schema public, extensions to mw_apply;
grant create on schema public to mw_apply;
-- Local only: tables belong to the local superuser; membership stands in for that ownership, as in funnel_nonsuper_apply.sh.
grant postgres, byus_admin, localsuper to mw_apply;
grant execute on function public.assert_active_admin(uuid,uuid,boolean) to mw_apply;
\i $TMP/fixtures.sql
set local session_replication_role = replica;
select pg_temp.mw_admins();
select pg_temp.mw_users();
select pg_temp.mw_rows();
set local session_replication_role = origin;
-- Superuser answer first (a second copy of the function under another name would only repeat the same text, so the file is applied twice).
\i $TMP/migration.sql
create temp table mw_super as select public.read_admin_weekly_metrics((select admin_user from mw_ids), (select admin_allow from mw_ids)) result;
\i $TMP/rollback.sql
do \$\$ begin if to_regprocedure('public.read_admin_weekly_metrics(uuid,uuid)') is not null then raise exception 'MW_ROLLBACK: function still there'; end if; end \$\$;
grant all on mw_super to public;
set role mw_apply;
\i $TMP/migration.sql
reset role;
do \$\$
declare i mw_ids; owner_name name; probe jsonb; policies int;
begin
  select * into i from mw_ids;
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = 'public.read_admin_weekly_metrics(uuid,uuid)'::regprocedure;
  if owner_name <> 'mw_apply' then raise exception 'MW_OWNER: owned by %', owner_name; end if;
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'mw_apply') then raise exception 'probe role is privileged'; end if;
  probe := public.read_admin_weekly_metrics(i.admin_user, i.admin_allow);
  if probe is distinct from (select result from mw_super) then raise exception 'MW_NONSUPER_DIFFERS: % vs %', probe, (select result from mw_super); end if;
  select count(*) into policies from pg_policy where polname like 'metrics\_weekly\_owner\_mw\_apply';
  raise notice 'non-superuser owner: same answer as the superuser, % select policies made', policies;
  if policies = 0 then raise exception 'MW_NO_POLICY: forced-row-security tables need a policy for a non-superuser owner'; end if;
end \$\$;
\i $TMP/rollback.sql
do \$\$ begin
  if to_regprocedure('public.read_admin_weekly_metrics(uuid,uuid)') is not null then raise exception 'MW_ROLLBACK2: function still there'; end if;
  if exists (select 1 from pg_policy where polname like 'metrics\_weekly\_owner\_%') then raise exception 'MW_ROLLBACK2: policy left'; end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname like 'metrics\\_weekly\\_%') then raise exception 'MW_ROLLBACK2: index left'; end if;
end \$\$;
\i $TMP/rollback.sql
rollback;
SQL

echo "== part 2b: a role that cannot read stops the file with OWNER_GAP =="
set +e
OUT="$(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" 2>&1 <<SQL
begin;
create role mw_gap nologin nosuperuser nobypassrls;
grant usage on schema public, extensions to mw_gap;
grant create on schema public to mw_gap;
grant execute on function public.assert_active_admin(uuid,uuid,boolean) to mw_gap;
set role mw_gap;
\i $TMP/migration-no-indexes.sql
rollback;
SQL
)"
STATUS=$?
set -e
if [ "$STATUS" -eq 0 ] || ! grep -q "METRICS_WEEKLY_OWNER_GAP" <<<"$OUT"; then echo "OWNER_GAP expected, got status $STATUS: $OUT"; exit 1; fi
echo "owner gap stops the file: $(grep -o 'METRICS_WEEKLY_OWNER_GAP[^"]*' <<<"$OUT" | head -1 | cut -c1-140)"
echo "all ok"

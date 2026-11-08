#!/usr/bin/env bash
# REVIEW-FUNNEL H1: 20261219010000 applied by a role shaped like dev's byus_admin (no superuser, no BYPASSRLS, a member of
# postgres and byus_admin). One transaction, rolled back, the role included. The functions that role now owns run as it,
# so FORCE row security applies to their reads. Checks:
#   (1) read_admin_web_traffic and read_admin_funnel_analytics count what a superuser counts directly,
#   (2) project_funnel_activity_event_v1 still finds the post's creator for a comment and records it,
#   (3) the readers, the projector and the IP budget belong to the applying role.
# usage: funnel_nonsuper_apply.sh   STRIP_POLICY=1: the migration without its owner-policy block, to show reads coming back empty.
# Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: byus.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' "$1"; }
strip "$ROOT/supabase/rollback/20261219010000_funnel_events.sql" > "$TMP/rollback.sql"
strip "$ROOT/supabase/migrations/20261219010000_funnel_events.sql" > "$TMP/migration.sql"
EXPECT=1
if [ "${STRIP_POLICY:-}" = 1 ]; then
  sed -i '' '/-- owner-policy-begin/,/-- owner-policy-end/d' "$TMP/migration.sql"
  EXPECT=0
fi
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
create role f_funnel_apply nologin nosuperuser nobypassrls;
grant postgres, byus_admin to f_funnel_apply;
-- Local only: objects made by earlier local applies belong to the local superuser; membership stands in for that ownership.
grant localsuper to f_funnel_apply;
\i $TMP/rollback.sql
set role f_funnel_apply;
\i $TMP/migration.sql
reset role;
do \$\$
declare
  admin_user uuid := '95900000-0000-4000-8000-000000000001';
  admin_allowlist uuid := '95900000-0000-4000-8000-000000000002';
  fan uuid := '95900000-0000-4000-8000-000000000011';
  celebrity uuid := '95900000-0000-4000-8000-000000000021';
  post uuid := '95900000-0000-4000-8000-000000000031';
  comment uuid := '95900000-0000-4000-8000-000000000032';
  v_from timestamptz := (date_trunc('day', statement_timestamp() at time zone 'UTC') at time zone 'UTC') - interval '6 days';
  v_to timestamptz := (date_trunc('day', statement_timestamp() at time zone 'UTC') at time zone 'UTC') + interval '1 day';
  traffic jsonb; funnel jsonb;
  want_visits bigint; want_views bigint; want_accounts bigint;
  owners_ok boolean; traffic_ok boolean; funnel_ok boolean; comment_ok boolean;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'f_funnel_apply') then raise exception 'probe role is privileged'; end if;
  owners_ok := (select bool_and(pg_get_userbyid(proowner) = 'f_funnel_apply') from pg_proc where oid in (
    'public.read_admin_web_traffic(uuid,uuid,integer)'::regprocedure, 'public.read_admin_funnel_analytics(uuid,uuid,integer)'::regprocedure,
    'public.project_funnel_activity_event_v1()'::regprocedure, 'public.consume_product_event_ip_budget(text)'::regprocedure));
  raise notice 'policies for f_funnel_apply: %', (select string_agg(c.relname, ',' order by c.relname) from pg_policy p join pg_class c on c.oid = p.polrelid
    where 'f_funnel_apply'::regrole = any(p.polroles));

  insert into public.app_users(id, privy_user_id, verified_email) values
    (admin_user, 'did:privy:funnel-nonsuper-admin', 'funnel-nonsuper-admin@byus.test'),
    (fan, 'did:privy:funnel-nonsuper-fan', 'funnel-nonsuper-fan@byus.test');
  insert into public.admin_allowlist(id, email, role, active) values (admin_allowlist, 'funnel-nonsuper-admin@byus.test', 'viewer', true);
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role)
    values (celebrity, 'funnel-nonsuper-creator', 'published', '/fixture.webp', now(), '{creator}', 'creator');
  perform public.record_product_event_v1(1::smallint, 'page_view', null, repeat('9', 64), null, null, null, null, 'web.page_view',
    'page-view:95900000-0000-4000-8000-000000000101', statement_timestamp(),
    '{"pageKind":"home","entry":true,"channel":"direct","device":"mobile","browser":"safari","os":"ios"}');

  -- (2) a comment on a fan board post: the projector reads fan_posts for the creator.
  insert into public.fan_posts(id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash)
    values (post, celebrity, fan, 'nonsuper post', gen_random_uuid(), repeat('0', 64));
  insert into public.fan_post_comments(id, post_id, app_user_id, body, idempotency_key)
    values (comment, post, fan, 'nonsuper comment', gen_random_uuid());
  comment_ok := exists (select 1 from public.fan_product_events
    where idempotency_key = 'server:comment_created:' || comment and celebrity_id = celebrity);

  -- (1) the readers against what the superuser sees.
  select count(*) filter (where properties->>'entry' = 'true'), count(*) into want_visits, want_views
    from public.fan_product_events where event_name = 'page_view' and occurred_at >= v_from and occurred_at < v_to;
  select count(*) into want_accounts from public.app_users where created_at >= v_from and created_at < v_to;
  traffic := public.read_admin_web_traffic(admin_user, admin_allowlist, 7);
  funnel := public.read_admin_funnel_analytics(admin_user, admin_allowlist, 7);
  traffic_ok := (traffic#>>'{totals,visitors}')::bigint = want_visits and (traffic#>>'{totals,pageviews}')::bigint = want_views and want_visits > 0;
  funnel_ok := (funnel#>>'{steps,visitors}')::bigint = want_visits and (funnel#>>'{steps,accountCreated}')::bigint = want_accounts
    and (funnel#>>'{steps,firstActivity}')::bigint >= 1;
  raise notice 'probe1 traffic visits % / % (superuser), views % / %; funnel visits %, accounts % / %, first activity %',
    traffic#>>'{totals,visitors}', want_visits, traffic#>>'{totals,pageviews}', want_views,
    funnel#>>'{steps,visitors}', funnel#>>'{steps,accountCreated}', want_accounts, funnel#>>'{steps,firstActivity}';
  raise notice 'probe2 comment projected with its creator: %', comment_ok;
  raise notice 'RESULT owners=% traffic=% funnel=% comment=%', owners_ok, traffic_ok, funnel_ok, comment_ok;
  if $EXPECT = 1 and not (owners_ok and traffic_ok and funnel_ok and comment_ok) then raise exception 'probe failed'; end if;
end \$\$;
rollback;
SQL

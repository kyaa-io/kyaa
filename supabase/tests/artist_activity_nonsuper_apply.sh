#!/usr/bin/env bash
# Review r5 H1/H2: 20261216031000 (and 032000) applied and then RUN with the owner layout dev showed (2026-11-08 read):
#   postgres-shaped role e6_pg (no superuser; BYPASSRLS like dev postgres) owns fan_notifications, the push queues, app_users ...
#   and notification_delivery_is_eligible, create_external_notification_plan, the claim / prepare / maintenance functions;
#   byus_admin-shaped role e6_ad (no superuser, no BYPASSRLS, member of e6_pg) owns the group tables, fan_web_notification_path
#   and group_emit_notification, and applies the file.
# Then, as the callers do: a real artist comment and heartbeat (triggers), the web inbox read as service_role, a web push claim
# and the worker's maintenance call as service_role. One transaction, rolled back, roles included.
# usage: artist_activity_nonsuper_apply.sh [git-ref] [strict]
#   git-ref: take 20261216031000 from that commit (ccc30dbab shows the failure before the fix). No ref: the working tree.
#   strict: e6_pg has no BYPASSRLS either; the file must then add its own policies. The claim is not called in this mode
#           (the existing claim functions need BYPASSRLS on their own queues, which this file does not change).
# Needs 20261216030000 applied. Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: byus.
set -euo pipefail
REF="${1:-}"; MODE="${2:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e 'rollback;' -e "notify pgrst, 'reload schema';"; }
strip < "$ROOT/supabase/rollback/20261216031000_artist_activity_notifications.sql" > "$TMP/rb.sql"
if [ -n "$REF" ]; then git -C "$ROOT" show "$REF:supabase/migrations/20261216031000_artist_activity_notifications.sql"; else cat "$ROOT/supabase/migrations/20261216031000_artist_activity_notifications.sql"; fi | strip > "$TMP/m.sql"
strip < "$ROOT/supabase/rollback/20261216032000_community_invite_short_links.sql" > "$TMP/rb2.sql"
strip < "$ROOT/supabase/migrations/20261216032000_community_invite_short_links.sql" > "$TMP/m2.sql"
BYPASS=bypassrls; [ "$MODE" = strict ] && BYPASS=nobypassrls
EXPECT=true; [ -n "$REF" ] && EXPECT=false
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
set local lock_timeout = '20s';
create role e6_pg nologin nosuperuser $BYPASS;
create role e6_ad nologin nosuperuser nobypassrls;
grant e6_pg to e6_ad;
-- e6_pg keeps what dev postgres can reach through ownership (the objects real postgres and the local superuser own locally),
-- but is itself no superuser: row security and the grants this file makes are what decide.
grant postgres, localsuper to e6_pg;
grant usage, create on schema public to e6_pg, e6_ad;
grant usage on schema extensions to e6_pg, e6_ad;
-- dev byus_admin is a member of postgres; locally earlier applies also left functions owned by the local superuser.
grant localsuper, postgres to e6_ad;
\i $TMP/rb.sql
\i $TMP/rb2.sql
do \$\$
declare t text; f text;
begin
  foreach t in array array['fan_notifications','notification_delivery_outbox','mobile_push_delivery_outbox','push_subscriptions','notification_preferences','app_users','user_profiles','user_blocks','community_stamp_invite_codes'] loop
    execute format('alter table public.%I owner to e6_pg', t); end loop;
  foreach t in array array['group_comments','group_posts','group_pages','group_memberships','group_artist_bindings','group_artist_presence_settings','group_notification_settings','group_presence'] loop
    execute format('alter table public.%I owner to e6_ad', t); end loop;
  foreach f in array array['notification_delivery_is_eligible(uuid,timestamp with time zone)','create_external_notification_plan(uuid,timestamp with time zone)',
      'claim_localized_notification_deliveries(text,integer,integer)','mobile_prepare_push_delivery(uuid,text)','enqueue_due_notification_maintenance(timestamp with time zone)',
      'get_owned_web_notifications(uuid,content_locale)','get_community_stamp_invite_code(uuid)'] loop
    execute format('alter function public.%s owner to e6_pg', f); end loop;
  foreach f in array array['fan_web_notification_path(uuid,uuid)','group_emit_notification()'] loop
    execute format('alter function public.%s owner to e6_ad', f); end loop;
end \$\$;
set role e6_ad;
\i $TMP/m.sql
\i $TMP/m2.sql
reset role;
select string_agg(p.oid::regprocedure::text, ', ') as owned_by_applier from pg_proc p where p.proowner = 'e6_ad'::regrole and p.proname like 'artist%';
-- Fixture (as the local superuser): a page, its bound artist with presence sharing on, one member on the dev push list with a
-- browser subscription, a post.
select g.id as page from public.group_pages g where g.status = 'published' order by g.created_at limit 1 \gset
select (array_agg(u.id order by u.created_at))[1] as artist, (array_agg(u.id order by u.created_at))[2] as fan from (select u.id, u.created_at from public.app_users u
  where u.status = 'active' and not exists (select 1 from public.group_artist_bindings b where b.app_user_id = u.id)
    and not exists (select 1 from public.group_memberships m where m.page_id = :'page' and m.app_user_id = u.id) order by u.created_at limit 2) u \gset
insert into public.group_artist_bindings(page_id, app_user_id, verified_by) select :'page', :'artist', id from public.admin_allowlist limit 1;
insert into public.group_artist_presence_settings values (:'artist', true) on conflict (app_user_id) do update set enabled = true;
insert into public.group_memberships(page_id, app_user_id) values (:'page', :'artist'), (:'page', :'fan');
update public.artist_activity_push_control set mode = 'test', test_user_ids = array[:'fan'::uuid] where id;
-- Off first (as applied): the triggers below must write nothing. (Files before the switch have no column: skipped.)
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'artist_activity_push_control' and column_name = 'inbox_enabled') as has_switch \gset
\set probe_off_rows 0
\if :has_switch
update public.artist_activity_push_control set inbox_enabled = false where id;
insert into public.group_comments(post_id, author_id, body, anonymous) select p.id, :'artist', '꺼짐 탐침', false from public.group_posts p where p.page_id = :'page' and p.removed_at is null limit 1;
insert into public.group_presence values (:'page', :'artist', now()) on conflict (page_id, app_user_id) do update set seen_at = excluded.seen_at;
select (select count(*) from public.fan_notifications where app_user_id = :'fan' and kind::text like 'artist%') + (select count(*) from public.artist_online_daily where artist_app_user_id = :'artist') + (select count(*) from public.artist_activity_jobs where artist_app_user_id = :'artist') as off_rows \gset probe_
\echo PROBE switch off: rows written :probe_off_rows
update public.artist_activity_push_control set inbox_enabled = true where id;
\endif
insert into public.push_subscriptions(app_user_id, endpoint, endpoint_hash, p256dh, auth_secret)
  values (:'fan', 'https://fcm.googleapis.com/fcm/send/e6-probe', encode(extensions.digest('e6-probe', 'sha256'), 'hex'), repeat('p', 40), repeat('a', 16));
insert into public.group_posts(page_id, author_id, title, body, visibility, anonymous) values (:'page', :'fan', '탐침 글', '본문', 'public', false) returning id as post \gset
-- A due web push for an ordinary notice, so the claim's eligibility scan runs even if the artist notice falls in quiet hours.
insert into public.notification_delivery_outbox(notification_id, subscription_id, available_at)
  select n.id, s.id, now() - interval '1 minute' from public.fan_notifications n, public.push_subscriptions s
  where s.endpoint_hash = encode(extensions.digest('e6-probe', 'sha256'), 'hex') and n.kind::text in ('official_post', 'content_reply', 'live_24h', 'level_up') and not n.web_only
  limit 1;
-- The real triggers: an artist comment and a heartbeat.
insert into public.group_comments(post_id, author_id, body, anonymous) values (:'post', :'artist', '탐침 댓글', false);
delete from public.artist_online_daily where artist_app_user_id = :'artist';
-- now() (transaction start), so the notice is already due when the inbox is read in this same transaction.
insert into public.group_presence values (:'page', :'artist', now()) on conflict (page_id, app_user_id) do update set seen_at = excluded.seen_at;
-- The file before the review fix (git-ref ccc30dbab) has no failure table: it only raised a WARNING.
create table if not exists public.artist_activity_failures(kind text, artist_app_user_id uuid, error_state text, error_message text);
select (select count(*) from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment') as comment_notices,
       (select count(*) from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_online') as online_notices,
       (select count(*) from public.notification_delivery_outbox o join public.push_subscriptions s on s.id = o.subscription_id where s.endpoint like '%e6-probe') as queued_web_push,
       (select count(*) from public.artist_activity_failures where artist_app_user_id = :'artist') as recorded_failures \gset probe_
select coalesce(string_agg(kind || ' ' || error_state || ' ' || left(error_message, 120), ' | '), 'none') as failure_detail from public.artist_activity_failures where artist_app_user_id = :'artist' \gset probe_
select coalesce(string_agg(c.relname, ',' order by c.relname), 'none') as owner_policies from pg_policy pol join pg_class c on c.oid = pol.polrelid where pol.polname like 'artist_activity_owner_%' \gset probe_
\echo PROBE owner policies: :probe_owner_policies
\echo PROBE failures: :probe_failure_detail
\echo PROBE notices comment=:probe_comment_notices online=:probe_online_notices queued_web_push=:probe_queued_web_push recorded_failures=:probe_recorded_failures
create temporary table e6_fx as select :'fan'::uuid as fan, :probe_comment_notices::integer as comments, :probe_online_notices::integer as onlines, :probe_recorded_failures::integer as failures, :probe_off_rows::integer as off_rows;
grant select on e6_fx to service_role;
set role service_role;
do \$\$
declare fx record; n integer; inbox text; claim text; maint text; mode text := '$MODE'; expect boolean := $EXPECT;
begin
  select * into fx from e6_fx;
  begin
    select count(*) into n from jsonb_array_elements(public.get_owned_web_notifications(fx.fan, 'ko')) x where x ->> 'kind' like 'artist%';
    inbox := 'ok, artist rows ' || n;
  exception when others then inbox := 'failed ' || sqlstate || ' ' || sqlerrm; end;
  if mode = 'strict' then claim := 'not called (strict)'; else
    begin
      select count(*) into n from public.claim_localized_notification_deliveries('e6-probe', 100, 60);
      claim := 'ok, claimed ' || n;
    exception when others then claim := 'failed ' || sqlstate || ' ' || sqlerrm; end;
  end if;
  begin
    perform public.enqueue_due_notification_maintenance(now());
    maint := 'ok';
  exception when others then maint := 'failed ' || sqlstate || ' ' || sqlerrm; end;
  raise notice 'PROBE inbox(service_role): %', inbox;
  raise notice 'PROBE web push claim(service_role): %', claim;
  raise notice 'PROBE worker maintenance(service_role): %', maint;
  if fx.off_rows = 0 and fx.comments >= 1 and fx.onlines >= 1 and fx.failures = 0 and inbox like 'ok, artist rows 2' and (claim like 'ok%' or claim like 'not called%') and maint = 'ok' then
    raise notice 'RESULT pass (mode %)', mode;
  else
    raise notice 'RESULT FAIL (mode %)', mode;
    if expect then raise exception 'artist activity probe failed'; end if;
  end if;
end \$\$;
reset role;
rollback;
SQL

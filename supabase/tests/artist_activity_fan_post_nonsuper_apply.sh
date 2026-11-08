#!/usr/bin/env bash
# 20261216040000 applied by a non-superuser with the dev owner layout of artist_activity_nonsuper_apply.sh, then RUN:
#   e6_pg (no superuser; BYPASSRLS like dev postgres, or none in strict mode) owns fan_notifications and the notification functions;
#   e6_ad (byus_admin-shaped, member of e6_pg, no BYPASSRLS) owns the group and fan-post tables and applies 031000 and 040000.
# Then a real artist comment on a fan post (the trigger), the web inbox read and the worker's maintenance as service_role.
# One transaction, rolled back, roles included. usage: artist_activity_fan_post_nonsuper_apply.sh [strict]
# Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper. Database: byus. Needs 20261216030000 applied.
set -euo pipefail
MODE="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e 'rollback;' -e "notify pgrst, 'reload schema';"; }
strip < "$ROOT/supabase/rollback/20261216040000_artist_activity_fan_post_comments.sql" > "$TMP/rb40.sql"
strip < "$ROOT/supabase/rollback/20261216031000_artist_activity_notifications.sql" > "$TMP/rb31.sql"
strip < "$ROOT/supabase/migrations/20261216031000_artist_activity_notifications.sql" > "$TMP/m31.sql"
strip < "$ROOT/supabase/migrations/20261216040000_artist_activity_fan_post_comments.sql" > "$TMP/m40.sql"
BYPASS=bypassrls; [ "$MODE" = strict ] && BYPASS=nobypassrls
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
set local lock_timeout = '20s';
create role e6_pg nologin nosuperuser $BYPASS;
create role e6_ad nologin nosuperuser nobypassrls;
grant e6_pg to e6_ad;
grant postgres, localsuper to e6_pg;
grant usage, create on schema public to e6_pg, e6_ad;
grant usage on schema extensions to e6_pg, e6_ad;
grant localsuper, postgres to e6_ad;
\i $TMP/rb40.sql
\i $TMP/rb31.sql
do \$\$
declare t text; f text;
begin
  foreach t in array array['fan_notifications','notification_delivery_outbox','mobile_push_delivery_outbox','push_subscriptions','notification_preferences','app_users','user_profiles','user_blocks'] loop
    execute format('alter table public.%I owner to e6_pg', t); end loop;
  foreach t in array array['group_comments','group_posts','group_pages','group_memberships','group_artist_bindings','group_artist_presence_settings','group_notification_settings','group_presence','fan_post_comments','fan_posts','celebrities'] loop
    execute format('alter table public.%I owner to e6_ad', t); end loop;
  foreach f in array array['notification_delivery_is_eligible(uuid,timestamp with time zone)','create_external_notification_plan(uuid,timestamp with time zone)',
      'mobile_prepare_push_delivery(uuid,text)','enqueue_due_notification_maintenance(timestamp with time zone)','get_owned_web_notifications(uuid,content_locale)'] loop
    execute format('alter function public.%s owner to e6_pg', f); end loop;
  foreach f in array array['fan_web_notification_path(uuid,uuid)','group_emit_notification()'] loop
    execute format('alter function public.%s owner to e6_ad', f); end loop;
end \$\$;
set role e6_ad;
\i $TMP/m31.sql
\i $TMP/m40.sql
reset role;
select coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none') as owned_by_applier from pg_proc p where p.proowner = 'e6_ad'::regrole and p.proname like 'artist_activity_fan_post%' \gset probe_
\echo PROBE new functions owned by the applier (want empty): :probe_owned_by_applier
update public.artist_activity_push_control set inbox_enabled = true, mode = 'test' where id;
-- Fixture: the first published fan page of a public creator, a fresh bound artist and a member, a fan post.
select g.id as page, g.celebrity_id as celebrity from public.group_pages g where g.kind = 'fan' and g.status = 'published' order by g.created_at limit 1 \gset
select (array_agg(u.id order by u.created_at))[1] as artist, (array_agg(u.id order by u.created_at))[2] as fan from (select u.id, u.created_at from public.app_users u
  where u.status = 'active' and not exists (select 1 from public.group_artist_bindings b where b.app_user_id = u.id)
    and not exists (select 1 from public.group_memberships m where m.page_id = :'page' and m.app_user_id = u.id) order by u.created_at limit 2) u \gset
insert into public.group_artist_bindings(page_id, app_user_id, verified_by) select :'page', :'artist', id from public.admin_allowlist limit 1;
insert into public.group_memberships(page_id, app_user_id) values (:'page', :'artist'), (:'page', :'fan');
insert into public.fan_posts(celebrity_id, app_user_id, body, visibility, idempotency_key, create_request_hash) values (:'celebrity', :'fan', '탐침 팬 글', 'public', extensions.gen_random_uuid(), 'probe') returning id as post \gset
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:'post', :'artist', '탐침 아티스트 댓글', extensions.gen_random_uuid());
select (select count(*) from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment') as notices,
       (select count(*) from public.artist_activity_failures where artist_app_user_id = :'artist') as failures \gset probe_
select coalesce(string_agg(kind || ' ' || error_state || ' ' || left(error_message, 160), ' | '), 'none') as failure_detail from public.artist_activity_failures where artist_app_user_id = :'artist' \gset probe_
\echo PROBE fan-post notices=:probe_notices failures=:probe_failures (:probe_failure_detail)
-- Members-only post (review r6 H1) through the big-page path (review r6 L2): the fan holds no passport of this creator, so the
-- job the worker runs as service_role must finish and write nothing for them.
select exists (select 1 from public.fan_passports where app_user_id = :'fan' and celebrity_id = :'celebrity' and business_status = 'issued') as fan_holds \gset probe_
insert into public.fan_posts(celebrity_id, app_user_id, body, visibility, idempotency_key, create_request_hash) values (:'celebrity', :'artist', '탐침 회원 공개 글', 'members', extensions.gen_random_uuid(), 'probe') returning id as mpost \gset
update public.artist_activity_push_control set inbox_enabled = false where id;
insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key) values (:'mpost', :'artist', '탐침 회원 공개 글 댓글', extensions.gen_random_uuid()) returning id as mcomment \gset
update public.artist_activity_push_control set inbox_enabled = true where id;
insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_fan_post_comment', :'mcomment', :'page', :'artist', now()) returning id as mjob \gset
\echo PROBE fan holds a passport of this creator (want f): :probe_fan_holds
create temporary table e6_fx as select :'fan'::uuid as fan, :probe_notices::integer as notices, :probe_failures::integer as failures, :'mjob'::uuid as job;
grant select on e6_fx to service_role;
set role service_role;
do \$\$
declare fx record; n integer; link text; inbox text; maint text;
begin
  select * into fx from e6_fx;
  begin
    select count(*), max(x ->> 'deep_link') into n, link from jsonb_array_elements(public.get_owned_web_notifications(fx.fan, 'ko')) x where x ->> 'kind' = 'artist_comment';
    inbox := 'ok, artist_comment ' || n || ' ' || coalesce(link, 'no link');
  exception when others then inbox := 'failed ' || sqlstate || ' ' || sqlerrm; end;
  begin perform public.enqueue_due_notification_maintenance(now()); maint := 'ok';
  exception when others then maint := 'failed ' || sqlstate || ' ' || sqlerrm; end;
  raise notice 'PROBE inbox(service_role): %', inbox;
  raise notice 'PROBE worker maintenance(service_role): %', maint;
  if fx.notices = 1 and fx.failures = 0 and inbox like 'ok, artist_comment 1 /c/%/community/%#comment-%' and maint = 'ok' then raise notice 'RESULT pass (mode $MODE)';
  else raise exception 'RESULT FAIL (mode $MODE)'; end if;
end \$\$;
reset role;
select (select finished_at is not null and gave_up_at is null from public.artist_activity_jobs where id = :'mjob') as job_done,
       (select count(*) from public.fan_notifications where app_user_id = :'fan' and kind::text = 'artist_comment' and payload ->> 'postId' = :'mpost') as members_rows,
       (select count(*) from public.fan_notifications n where n.kind::text = 'artist_comment' and n.payload ->> 'postId' = :'mpost'
          and not public.fan_web_is_member(n.app_user_id, :'celebrity')) as non_holder_rows,
       (select count(*) from public.artist_activity_failures where artist_app_user_id = :'artist') as failures_after \gset probe_
\echo PROBE members-only job (service_role worker): done=:probe_job_done rows for the passport-less fan=:probe_members_rows non-holder rows=:probe_non_holder_rows failures=:probe_failures_after
select :'probe_job_done' = 't' and :probe_members_rows = 0 and :probe_non_holder_rows = 0 and :probe_failures_after = 0 as job_ok \gset probe_
\if :probe_job_ok
\echo RESULT members-only job pass (mode $MODE)
\else
\echo RESULT members-only job FAIL (mode $MODE)
select 1/0;
\endif
rollback;
SQL

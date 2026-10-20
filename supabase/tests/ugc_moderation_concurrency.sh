#!/usr/bin/env bash
# Isolated clean-chain database only; inherit the harness PG* connection.
set -euo pipefail
ARTIFACT_DIR="${ARTIFACT_DIR:-work/ugc-moderation-concurrency-$(date +%s)}"
mkdir -p "$ARTIFACT_DIR"
psql -X -v ON_ERROR_STOP=1 -q >"$ARTIFACT_DIR/setup.log" 2>&1 <<'SQL'
begin;
insert into public.app_users(id,privy_user_id,verified_email) values
 ('ca000000-0000-4000-8000-000000000001','did:privy:moderation-race-admin','moderation-race-admin@example.invalid'),
 ('ca000000-0000-4000-8000-000000000002','did:privy:moderation-race-first','moderation-race-first@example.invalid'),
 ('ca000000-0000-4000-8000-000000000003','did:privy:moderation-race-second','moderation-race-second@example.invalid');
insert into public.admin_allowlist(id,email,role,active)values('ca000000-0000-4000-8000-000000000004','moderation-race-admin@example.invalid','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('ca000000-0000-4000-8000-000000000005','moderation-race','published','/qa.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('ca000000-0000-4000-8000-000000000005','ko','검증','소개','사진'),('ca000000-0000-4000-8000-000000000005','en','QA','Summary','Photo');
select public.save_fan_post('ca000000-0000-4000-8000-000000000002','moderation-race',null,'First report target','public','{}',null,'ca000000-0000-4000-8000-000000000006');
select public.save_fan_post('ca000000-0000-4000-8000-000000000003','moderation-race',null,'Second report target','public','{}',null,'ca000000-0000-4000-8000-000000000007');
select public.post_content_report('ca000000-0000-4000-8000-000000000001','fan_post',id,'harassment',idempotency_key)from public.fan_posts where celebrity_id='ca000000-0000-4000-8000-000000000005';
commit;
SQL
wait_sleep() {
  local ready=false
  for _ in {1..50}; do
    if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1'and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
    sleep 0.1
  done
  [[ "$ready" == true ]] || { echo "holder did not reach checkpoint: $1" >&2; return 1; }
}
# A write holding the canonical user lock commits before a later restriction.
PGAPPNAME=ugc_write_holder psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/write-first.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
begin;
select public.save_fan_post('ca000000-0000-4000-8000-000000000002','moderation-race',null,'In-flight write','public','{}',null,'ca000000-0000-4000-8000-000000000008');
select pg_sleep(3);
commit;
SQL
HOLDER=$!
wait_sleep ugc_write_holder
if psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/restrict-after-write.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.resolve_admin_content_report('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000004',gen_random_uuid(),id,'resolved',true,'confirmed abuse in race',true)from public.content_reports where target_app_user_id='ca000000-0000-4000-8000-000000000002';
SQL
then echo "busy target restriction unexpectedly succeeded" >&2; exit 1; fi
rg -q FAN_WEB_ACCOUNT_BUSY "$ARTIFACT_DIR/restrict-after-write.log"
wait "$HOLDER"
psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/restrict-retry.log" 2>&1 <<'SQL'
select public.resolve_admin_content_report('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000004',gen_random_uuid(),id,'resolved',true,'confirmed abuse in race',true)from public.content_reports where target_app_user_id='ca000000-0000-4000-8000-000000000002';
SQL
# A restriction holding the same lock makes an overlapping new write fail after commit.
PGAPPNAME=ugc_restriction_holder psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/restrict-first.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
begin;
select public.resolve_admin_content_report('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000004',gen_random_uuid(),id,'resolved',true,'confirmed abuse in race',true)from public.content_reports where target_app_user_id='ca000000-0000-4000-8000-000000000003';
select pg_sleep(3);
commit;
SQL
HOLDER=$!
wait_sleep ugc_restriction_holder
if psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/write-after-restriction.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.save_fan_post('ca000000-0000-4000-8000-000000000003','moderation-race',null,'Must be rejected','public','{}',null,'ca000000-0000-4000-8000-000000000009');
SQL
then echo "restricted overlapping write unexpectedly succeeded" >&2; exit 1; fi
wait "$HOLDER"
rg -q FAN_WEB_ACTIVE_ACCOUNT_REQUIRED "$ARTIFACT_DIR/write-after-restriction.log"
psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/assert.log" 2>&1 <<'SQL'
do $$begin
 if not exists(select 1 from public.fan_posts where idempotency_key='ca000000-0000-4000-8000-000000000008')then raise exception 'in-flight write did not commit';end if;
 if exists(select 1 from public.fan_posts where idempotency_key='ca000000-0000-4000-8000-000000000009')then raise exception 'restriction failed to serialize later write';end if;
 if(select count(*)from public.app_user_moderation_restrictions where app_user_id in('ca000000-0000-4000-8000-000000000002','ca000000-0000-4000-8000-000000000003')and revoked_at is null)<>2 then raise exception 'restrictions did not commit';end if;
end$$;
SQL
# Deletion takes the owner lock before touching report rows. Resolution must fail
# fast while deletion holds it rather than creating report-row/owner-lock deadlock.
psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/deletion-report.log" 2>&1 <<'SQL'
select public.post_content_report('ca000000-0000-4000-8000-000000000001','fan_post',id,'harassment',idempotency_key)from public.fan_posts where idempotency_key='ca000000-0000-4000-8000-000000000008';
SQL
PGAPPNAME=ugc_deletion_holder psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/deletion-first.log" 2>&1 <<'SQL' &
set statement_timeout='12s';
begin;
select pg_advisory_xact_lock(hashtextextended('fan-web-user:ca000000-0000-4000-8000-000000000002',0));
select pg_sleep(3);
select public.begin_owned_account_deletion('did:privy:moderation-race-first');
commit;
SQL
HOLDER=$!
wait_sleep ugc_deletion_holder
if psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/restrict-during-deletion.log" 2>&1 <<'SQL'
set statement_timeout='12s';
select public.resolve_admin_content_report('ca000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000004',gen_random_uuid(),id,'resolved',true,'confirmed abuse in race',true)from public.content_reports where target_app_user_id='ca000000-0000-4000-8000-000000000002'and status='open';
SQL
then echo "deleting target restriction unexpectedly succeeded" >&2; exit 1; fi
rg -q FAN_WEB_ACCOUNT_BUSY "$ARTIFACT_DIR/restrict-during-deletion.log"
wait "$HOLDER"
psql -X -v ON_ERROR_STOP=1 >"$ARTIFACT_DIR/deletion-assert.log" 2>&1 <<'SQL'
do $$begin if not exists(select 1 from public.account_deletion_requests where app_user_id='ca000000-0000-4000-8000-000000000002')then raise exception 'deletion failed to finish';end if;end$$;
SQL
echo "UGC restriction/write/deletion races PASS; logs: $ARTIFACT_DIR"

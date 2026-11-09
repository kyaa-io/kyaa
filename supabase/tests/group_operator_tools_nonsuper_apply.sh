#!/usr/bin/env bash
# B8 1단계 B3 보강: dev와 같은 소유자 배치에서 20261219080000~084000을 적용하고 group_operator_tools.sql을 돌린다.
#   b8_pg: postgres 모양(슈퍼유저 아님, BYPASSRLS) — fan_notifications·audit_logs·유지보수 함수 소유
#   b8_ad: byus_admin 모양(슈퍼유저 아님, b8_pg 구성원) — 그룹 표·그룹 함수·fan_web_notification_path/kind 소유, 파일을 적용하는 역할
# mode bypass(기본): b8_ad도 BYPASSRLS. mode strict: b8_ad는 BYPASSRLS 없음 -> 파일의 OWNER_GAP 블록이 정책을 만들어야 한다.
# 일회용 클러스터 전용. usage: group_operator_tools_nonsuper_apply.sh <socket-dir> <port> <fresh-database-with-chain> [bypass|strict]
set -euo pipefail
SOCKET_DIR="$1"; PORT="$2"; DB="$3"; MODE="${4:-bypass}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sql() { psql -X -q -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -d "$DB" "$@"; }
BYPASS=bypassrls; [ "$MODE" = strict ] && BYPASS=nobypassrls
sql <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'b8_pg') then create role b8_pg nologin nosuperuser bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'b8_ad') then create role b8_ad nologin nosuperuser $BYPASS; end if;
end \$\$;
-- 소유권으로 닿는 범위는 지금 소유자(부트스트랩 슈퍼유저)의 것을 물려받되, 두 역할 자체는 슈퍼유저가 아니다.
do \$\$ begin execute format('grant %I to b8_pg', current_user); end \$\$;
grant b8_pg to b8_ad;
grant usage, create on schema public to b8_pg, b8_ad;
grant usage on schema extensions to b8_pg, b8_ad;
-- 소유자는 로컬 byus(2026-11-09)의 배치를 그대로 옮긴다: byus_admin -> b8_ad, postgres -> b8_pg. 나머지는 부트스트랩 슈퍼유저 그대로.
do \$\$ declare r record; begin
  for r in select * from (values
    ('f','fan_web_notification_path_before_artist_activity(uuid,uuid)','b8_ad'),
    ('f','enqueue_due_notification_maintenance_before_artist_activity(timestamp with time zone)','b8_pg'),
    ('f','enqueue_due_notification_maintenance(timestamp with time zone)','b8_pg'),
    ('f','group_public_directory_owner_roles()','b8_ad'),
    ('f','group_directory_facts(jsonb)','b8_ad'),
    ('f','group_wallet_assert_new_request(uuid,uuid)','b8_ad'),
    ('f','groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','fan_web_notification_path(uuid,uuid)','b8_ad'),
    ('f','fan_web_notification_path_before_group_categories(uuid,uuid)','b8_ad'),
    ('f','fan_web_notification_path_before_activity(uuid,uuid)','b8_pg'),
    ('f','public_fan_avatar_url(uuid)','b8_pg'),
    ('f','fan_web_notification_can_send(uuid)','b8_pg'),
    ('f','fan_web_notification_kind(text)','b8_ad'),
    ('f','fan_web_notification_kind_before_group_raffle(text)','b8_pg'),
    ('f','fan_web_notification_path_before_group_raffle(uuid,uuid)','b8_ad'),
    ('f','fan_web_notification_path_before_groups(uuid,uuid)','b8_pg'),
    ('f','fan_web_notification_path_before_social(uuid,uuid)','b8_pg'),
    ('f','group_activity_history_immutable()','b8_ad'),
    ('f','group_ensure_default_rooms(uuid)','b8_ad'),
    ('f','group_event_json(uuid,uuid)','b8_ad'),
    ('f','group_post_visible(uuid,uuid)','b8_ad'),
    ('f','group_raffle_list(uuid,uuid)','b8_ad'),
    ('f','group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_activities_dispatch_before_group_images(text,uuid,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_activity_evidence_json(uuid)','b8_ad'),
    ('f','group_activity_submission_json(uuid)','b8_ad'),
    ('f','group_application_integrity_guard()','b8_ad'),
    ('f','group_application_review_revision()','b8_ad'),
    ('f','group_attach_activity_evidence(uuid,text,uuid,uuid)','b8_ad'),
    ('f','group_activity_next_cursor(text,uuid,boolean,integer,uuid)','b8_ad'),
    ('f','group_artist_mark_items(uuid,jsonb)','b8_ad'),
    ('f','group_attach_image(uuid,text,uuid,uuid)','b8_ad'),
    ('f','group_attach_image_before_gifts(uuid,text,uuid,uuid)','b8_ad'),
    ('f','group_capsule_dispatch(text,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_capsule_roll()','b8_ad'),
    ('f','group_earning_rows(uuid,uuid)','b8_ad'),
    ('f','group_emit_notification()','b8_ad'),
    ('f','group_gift_immutable_snapshot()','b8_ad'),
    ('f','group_event_json_before_source_fields(uuid,uuid)','b8_ad'),
    ('f','group_event_submission_source_immutable()','b8_ad'),
    ('f','group_event_support_json(uuid)','b8_ad'),
    ('f','group_gift_immutable_history()','b8_ad'),
    ('f','group_invitation_consent_immutable()','b8_ad'),
    ('f','group_mission_json(uuid,uuid)','b8_ad'),
    ('f','group_membership_invitation_dispatch(text,uuid,uuid,uuid,jsonb)','b8_ad'),
    ('f','group_mission_json_before_activity_evidence(uuid,uuid)','b8_ad'),
    ('f','group_notification_gate_insert()','b8_ad'),
    ('f','group_gift_json(uuid)','b8_ad'),
    ('f','group_invitation_staff(uuid,uuid)','b8_ad'),
    ('f','group_gifts_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_notification_row_allowed(fan_notifications)','b8_ad'),
    ('f','group_page_json(uuid,text)','b8_ad'),
    ('f','group_notification_page(text,uuid)','b8_ad'),
    ('f','group_page_name(uuid,text)','b8_ad'),
    ('f','group_pages_default_rooms_trigger()','b8_ad'),
    ('f','group_post_json(uuid)','b8_ad'),
    ('f','group_post_view(uuid,uuid)','b8_ad'),
    ('f','group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_publish_application_image()','b8_ad'),
    ('f','group_raffle_advance(uuid)','b8_ad'),
    ('f','group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_release_application_evidence()','b8_ad'),
    ('f','group_release_deleted_activity_evidence()','b8_ad'),
    ('f','group_release_deleted_image()','b8_ad'),
    ('f','group_raffle_list_before_gifts(uuid,uuid)','b8_ad'),
    ('f','group_raffle_notify_winner()','b8_ad'),
    ('f','group_room_allowed(uuid,uuid,text)','b8_ad'),
    ('f','group_rooms_sync_stage()','b8_ad'),
    ('f','group_scope_visible(uuid,uuid)','b8_ad'),
    ('f','group_wallet_ad_consumed_today(uuid)','b8_ad'),
    ('f','group_wallet_ad_day_start()','b8_ad'),
    ('f','group_wallet_ad_need(integer[])','b8_ad'),
    ('f','group_wallet_balance(uuid,text)','b8_ad'),
    ('f','group_wallet_enabled()','b8_ad'),
    ('f','group_wallet_lock(uuid,boolean)','b8_ad'),
    ('f','group_wallet_legacy_lock(uuid)','b8_ad'),
    ('f','group_wallet_lock_target(uuid)','b8_ad'),
    ('f','group_wallet_assign_sequence()','b8_ad'),
    ('f','group_wallet_invitation_lock(uuid,uuid)','b8_ad'),
    ('f','group_wallet_post_correction(uuid,text,bigint,text,uuid)','b8_ad'),
    ('f','group_wallet_refund(uuid,bigint,uuid)','b8_ad'),
    ('f','group_wallet_refund_lock(uuid)','b8_ad'),
    ('f','groups_content_dispatch_before_artist_mark(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_content_dispatch_before_group_categories(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_content_dispatch_before_own_reports(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_joined_visited(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_featured_today(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_group_images(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','passport_hearts(uuid,uuid)','b8_pg'),
    ('f','groups_content_dispatch_before_post_dislike(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_public_directory_owner_functions()','b8_ad'),
    ('f','group_comment_reply_counts(uuid,jsonb)','b8_ad'),
    ('f','groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_notification_allowed(uuid,text,text,uuid)','b8_ad'),
    ('f','group_notification_category(text,text)','b8_ad'),
    ('f','group_room_entry(uuid,uuid)','b8_ad'),
    ('f','group_authorize_collection_import(uuid,uuid)','b8_ad'),
    ('f','group_room_gate(uuid,uuid,text)','b8_ad'),
    ('f','group_wallet_post(uuid,text,bigint,text,uuid)','b8_ad'),
    ('f','groups_content_dispatch_before_default_rooms(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_content_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_artist_mark(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','groups_dispatch_before_name_locale(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_event_approval_audit_owner_access()','b8_ad'),
    ('f','group_event_approval_on_insert()','b8_ad'),
    ('f','group_event_approval_requeue()','b8_ad'),
    ('f','group_event_registration_approval_gate()','b8_ad'),
    ('f','group_event_json_before_approval(uuid,uuid)','b8_ad'),
    ('f','fan_web_notification_kind_before_event_approval(text)','b8_ad'),
    ('f','fan_web_notification_path_before_event_approval(uuid,uuid)','b8_ad'),
    ('f','group_activities_dispatch_before_event_approval(text,uuid,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('f','group_public_visible_page(uuid,uuid)','b8_ad'),
    ('f','group_public_directory_owner_tables()','b8_ad'),
    ('f','group_public_directory_owner_check()','b8_ad'),
    ('f','group_public_directory_owner_access()','b8_ad'),
    ('f','group_page_ensure_for_celebrity(uuid)','b8_ad'),
    ('f','group_pages_follow_celebrity_trigger()','b8_ad'),
    ('f','group_save_application_qualification(uuid,uuid,jsonb,integer)','b8_ad'),
    ('f','group_application_status(uuid,uuid,integer)','b8_ad'),
    ('f','groups_content_dispatch_before_rich_body(text,uuid,uuid,uuid,jsonb,uuid)','b8_ad'),
    ('t','public.app_user_avatars','b8_pg'),
    ('t','public.app_users','b8_pg'),
    ('t','public.fan_heart_conversions','b8_pg'),
    ('t','public.group_action_receipts','b8_ad'),
    ('t','public.group_application_evidence','b8_ad'),
    ('t','public.group_comments','b8_ad'),
    ('t','public.group_creator_attendance','b8_ad'),
    ('t','public.group_capsule_prizes','b8_ad'),
    ('t','public.group_artist_bindings','b8_ad'),
    ('t','public.group_collection_import_limits','b8_ad'),
    ('t','public.group_bookmarks','b8_ad'),
    ('t','public.group_capsule_campaigns','b8_ad'),
    ('t','public.group_content_release','b8_ad'),
    ('t','public.group_capsule_fulfillments','b8_ad'),
    ('t','public.group_capsule_receipts','b8_ad'),
    ('t','public.group_collections','b8_ad'),
    ('t','public.group_activity_evidence','b8_ad'),
    ('t','public.group_applications','b8_ad'),
    ('t','public.group_application_qualification_history','b8_ad'),
    ('t','public.group_event_registrations','b8_ad'),
    ('t','public.group_event_checkin_audit','b8_ad'),
    ('t','public.group_activity_receipts','b8_ad'),
    ('t','public.group_messages','b8_ad'),
    ('t','public.group_invitation_delivery_test_sink','b8_ad'),
    ('t','public.group_event_support_submissions','b8_ad'),
    ('t','public.group_memberships','b8_ad'),
    ('t','public.group_image_references','b8_ad'),
    ('t','public.group_membership_invitations','b8_ad'),
    ('t','public.group_gift_history','b8_ad'),
    ('t','public.group_gift_applications','b8_ad'),
    ('t','public.group_membership_invitation_consents','b8_ad'),
    ('t','public.group_event_review_revisions','b8_ad'),
    ('t','public.group_event_support_reviews','b8_ad'),
    ('t','public.group_invitation_email_outbox','b8_ad'),
    ('t','public.group_mission_submissions','b8_ad'),
    ('t','public.group_reports','b8_ad'),
    ('t','public.group_raffle_candidates','b8_ad'),
    ('t','public.group_presence','b8_ad'),
    ('t','public.group_raffle_entries','b8_ad'),
    ('t','public.group_mission_submission_revisions','b8_ad'),
    ('t','public.group_raffle_winners','b8_ad'),
    ('t','public.group_post_views','b8_ad'),
    ('t','public.group_raffle_access_audit','b8_ad'),
    ('t','public.group_official_event_applications','b8_ad'),
    ('t','public.group_raffle_recipients','b8_ad'),
    ('t','public.group_missions','b8_ad'),
    ('t','public.group_raffles','b8_ad'),
    ('t','public.group_room_reads','b8_ad'),
    ('t','public.group_posts','b8_ad'),
    ('t','public.group_post_reactions','b8_ad'),
    ('t','public.group_mission_submission_reviews','b8_ad'),
    ('t','public.group_wallet_attendance','b8_ad'),
    ('t','public.group_wallet_policy','b8_ad'),
    ('t','public.group_wallet_owner_sequences','b8_ad'),
    ('t','public.group_wallet_receipts','b8_ad'),
    ('t','public.group_rooms','b8_ad'),
    ('t','public.group_visits','b8_ad'),
    ('t','public.group_wallet_ad_sessions','b8_ad'),
    ('t','public.group_wallet_release','b8_ad'),
    ('t','public.user_blocks','b8_pg'),
    ('t','public.audit_logs','b8_pg'),
    ('t','public.creator_heart_ledger','b8_pg'),
    ('t','public.group_events','b8_ad'),
    ('t','public.group_event_approval_audit','b8_ad'),
    ('t','public.fan_notifications','b8_pg'),
    ('t','public.user_profiles','b8_pg'),
    ('t','public.group_artist_presence_settings','b8_ad'),
    ('t','public.group_notification_settings','b8_ad'),
    ('t','public.group_pages','b8_ad'),
    ('t','public.celebrities','b8_pg')) v(kind, obj, owner) loop
    if r.kind = 't' and to_regclass(r.obj) is not null then execute format('alter table %s owner to %I', r.obj, r.owner);
    elsif r.kind = 'f' and to_regprocedure(r.obj) is not null then execute format('alter function %s owner to %I', r.obj, r.owner);
    end if;
  end loop;
  -- dev처럼 postgres 모양 역할이 이미 가진 실행 권한(로컬 byus 2026-11-09 proacl: postgres=X). group_post_visible에는 없다(파일이 준다).
  grant execute on function public.fan_web_notification_kind(text), public.group_notification_allowed(uuid,text,text,uuid),
    public.group_notification_row_allowed(public.fan_notifications) to b8_pg;
  alter table public.audit_logs owner to b8_pg;
end \$\$;
SQL
for f in 20261219080000_group_operator_access 20261219081000_group_operator_members 20261219082000_group_mission_stats 20261219083000_group_notice_kind 20261219084000_group_notice_broadcast; do
  sql -c "set role b8_ad" -f "$ROOT/supabase/migrations/$f.sql" >/dev/null
  echo "applied as b8_ad: $f"
done
sql <<'SQL'
do $$ declare bad text; begin
  select string_agg(p.oid::regprocedure::text || '=' || o.rolname, ', ') into bad from pg_proc p join pg_roles o on o.oid = p.proowner
   where p.oid in ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
     'public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, 'public.group_operator_role(uuid,uuid)'::regprocedure,
     'public.group_operator_members_dispatch(text,uuid,uuid,jsonb)'::regprocedure, 'public.group_mission_stats_read(uuid,uuid,jsonb)'::regprocedure,
     'public.run_group_notice_broadcasts(integer,text)'::regprocedure, 'public.fan_web_notification_path(uuid,uuid)'::regprocedure,
     'public.enqueue_due_notification_maintenance(timestamp with time zone)'::regprocedure, 'public.group_role_audit_capture()'::regprocedure)
     and o.rolsuper;
  if bad is not null then raise exception 'B3 superuser owner: %', bad; end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) <> 'b8_ad'
    or (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.run_group_notice_broadcasts(integer,text)'::regprocedure) <> 'b8_pg'
    or (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.enqueue_due_notification_maintenance(timestamp with time zone)'::regprocedure) <> 'b8_pg' then
    raise exception 'B3 owners not as expected';
  end if;
  raise notice 'PASS B3 새 definer 함수 소유자 rolsuper=false (진입·헬퍼 b8_ad, 작업자·유지보수 b8_pg)';
end $$;
SQL
sql -f "$ROOT/supabase/tests/group_operator_tools.sql" | tail -1
echo "GROUP_OPERATOR_TOOLS_NONSUPER_PASS ($MODE)"

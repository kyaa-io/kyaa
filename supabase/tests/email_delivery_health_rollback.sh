#!/usr/bin/env bash
# Rollback pair for 20261227220002: roll back, check the old shape, apply again, rerun the contract test.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
q() { psql -X -v ON_ERROR_STOP=1 -q "$@"; }
q -f "$ROOT/supabase/rollback/20261227220002_email_delivery_health.sql"
q -f "$ROOT/supabase/rollback/20261227220001_email_delivery_blocked_kind.sql" >/dev/null
test "$(q -Atc "select to_regclass('public.email_delivery_events') is null and to_regprocedure('public.record_ses_email_event(jsonb)') is null and to_regprocedure('public.fan_web_notification_kind_before_email_delivery(text)') is null and not public.fan_web_notification_kind('email_delivery_blocked') and position('email_delivery_blocked' in pg_get_constraintdef((select oid from pg_constraint where conname='fan_notifications_source_shape')))=0 and position('email_channel_delivery_blocked' in pg_get_functiondef('public.create_external_notification_plan_before_fan_web(uuid,timestamptz)'::regprocedure))=0")" = t
q -f "$ROOT/supabase/migrations/20261227220002_email_delivery_health.sql"
q -f "$ROOT/supabase/tests/email_delivery_health.sql" >/dev/null
echo "email_delivery_health rollback pair ok"

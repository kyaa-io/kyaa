#!/usr/bin/env bash
# 20261228110000: the SES feedback Lambda's real payloads (fixture kept equal by
# apps/worker/test/ses-feedback-db-contract.test.ts) through the real record_ses_email_event,
# then the rollback pair: back to 20261227220102's input, forward again, contract still holds.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
q() { psql -X -v ON_ERROR_STOP=1 -q "$@"; }
contract() { q -v payloads="$(cat "$ROOT/supabase/tests/fixtures/ses_feedback_worker_payloads.json")" -f "$ROOT/supabase/tests/ses_feedback_worker_contract.sql"; }
contract
q -f "$ROOT/supabase/rollback/20261228110000_ses_feedback_worker_contract.sql"
test "$(q -Atc "select position('''snsMessageId''' in prosrc) > 0 and position('''sns_message_id''' in prosrc) = 0 from pg_proc where oid = 'public.record_ses_email_event(jsonb)'::regprocedure")" = t
q -f "$ROOT/supabase/migrations/20261228110000_ses_feedback_worker_contract.sql"
contract
q -f "$ROOT/supabase/tests/email_delivery_health.sql"
echo "ses_feedback_worker_contract ok"

#!/usr/bin/env bash
set -euo pipefail
pids=()
for i in {1..10}; do
  psql -Xq -v ON_ERROR_STOP=1 -c "set role legacy_auth_migrator; select public.verify_legacy_email_password('concurrent-attempt@example.test','wrong');" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists(select from public.legacy_email_password_attempts where email_sha256=encode(extensions.digest('concurrent-attempt@example.test','sha256'),'hex') and failure_count=5 and locked_until>now()) then
    raise exception 'concurrent attempts bypassed limit';
  end if;
end $$;
delete from public.legacy_email_password_attempts where email_sha256=encode(extensions.digest('concurrent-attempt@example.test','sha256'),'hex');
SQL
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql -Xq -v ON_ERROR_STOP=1 -f "$root_dir/supabase/rollback/20261226010000_legacy_email_password_attempt_limit.sql"
psql -Xq -v ON_ERROR_STOP=1 -f "$root_dir/supabase/tests/cognito_email_compatibility.sql"
psql -Xq -v ON_ERROR_STOP=1 -f "$root_dir/supabase/migrations/20261226010000_legacy_email_password_attempt_limit.sql"

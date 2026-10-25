#!/usr/bin/env bash
set -euo pipefail
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')" == byus_clean ]] || { echo 'Disposable byus_clean database required' >&2; exit 1; }
proof_dir="$(mktemp -d)"
trap 'rm -rf "$proof_dir"' EXIT
fixture="live-concurrency-$$"
invoke() {
  psql -X -At -v ON_ERROR_STOP=1 -c "begin; select app_user_id from public.sync_privy_identity_with_provider_accounts('did:privy:$1','$1@example.test',91342,'$2','[{\"issuer\":\"https://accounts.google.com\",\"subject\":\"$3\"}]'); select pg_sleep($4); commit;"
}
invoke "$fixture-a" 0x1111111111111111111111111111111111111901 "$fixture-subject" 1 >"$proof_dir/first" 2>&1 &
first_pid=$!
invoke "$fixture-b" 0x1111111111111111111111111111111111111902 "$fixture-subject" 1 >"$proof_dir/second" 2>&1 &
second_pid=$!
first_status=0; wait "$first_pid" || first_status=$?
second_status=0; wait "$second_pid" || second_status=$?
if [[ "$first_status" == 0 && "$second_status" != 0 ]]; then loser=second
elif [[ "$first_status" != 0 && "$second_status" == 0 ]]; then loser=first
else cat "$proof_dir/first" "$proof_dir/second"; echo 'Expected exactly one owner to succeed' >&2; exit 1; fi
grep -q VERIFIED_PROVIDER_OWNER_CONFLICT "$proof_dir/$loser" || { cat "$proof_dir/$loser"; exit 1; }
[[ "$(psql -X -At -c "select count(*) from public.app_users where privy_user_id in ('did:privy:$fixture-a','did:privy:$fixture-b')")" == 1 ]] || exit 1
invoke "$fixture-same" 0x1111111111111111111111111111111111111903 "$fixture-same-subject" 1 >"$proof_dir/retry-first" 2>&1 &
first_pid=$!
invoke "$fixture-same" 0x1111111111111111111111111111111111111903 "$fixture-same-subject" 1 >"$proof_dir/retry-second" 2>&1 &
second_pid=$!
wait "$first_pid" || { cat "$proof_dir/retry-first"; exit 1; }
wait "$second_pid" || { cat "$proof_dir/retry-second"; exit 1; }
[[ "$(psql -X -At -c "select count(*) from public.live_privy_auth_accounts a join public.app_users u on u.id=a.app_user_id where u.privy_user_id='did:privy:$fixture-same' and a.provider_subject='$fixture-same-subject'")" == 1 ]] || exit 1
echo 'Cognito live inventory concurrent conflict and retry passed'

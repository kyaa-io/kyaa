#!/usr/bin/env bash
set -euo pipefail
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c 'select current_database()')" == byus_clean ]] || { echo 'Disposable byus_clean database required' >&2; exit 1; }
proof_dir="$(mktemp -d)"
trap 'rm -rf "$proof_dir"' EXIT
fixture="kyaa-email-race-$$"
invoke() {
  psql -X -At -v ON_ERROR_STOP=1 -c "begin; select public.create_kyaa_member('https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_race','$fixture-$1','$2','$fixture-$1','$fixture@example.test',91342,nextval('public.kyaa_wallet_derivation_index_seq'),'0x'||md5('$fixture-$1')||'12345678'); select pg_sleep(1); commit;"
}
invoke google https://accounts.google.com >"$proof_dir/google" 2>&1 &
first=$!
invoke apple https://appleid.apple.com >"$proof_dir/apple" 2>&1 &
second=$!
a=0; wait "$first" || a=$?
b=0; wait "$second" || b=$?
if [[ "$a" == 0 && "$b" != 0 ]]; then loser=apple
elif [[ "$a" != 0 && "$b" == 0 ]]; then loser=google
else cat "$proof_dir/google" "$proof_dir/apple"; echo 'Expected exactly one email owner' >&2; exit 1; fi
grep -q IDENTITY_LINK_CONFLICT "$proof_dir/$loser"
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.app_users where verified_email='$fixture@example.test'")" == 1 ]]
echo 'Concurrent Google/Apple registration creates exactly one email owner'

#!/usr/bin/env bash
set -euo pipefail
log_dir=$(mktemp -d)
trap 'rm -rf "$log_dir"' EXIT
printf 'GROUP_WALLET_INSUFFICIENT_BALANCE\n' > "$log_dir/a"
awk 'BEGIN { for (i = 0; i < 100000; i++) print "large log entry" }' >> "$log_dir/a"
: > "$log_dir/b"
grep -q GROUP_WALLET_INSUFFICIENT_BALANCE "$log_dir/a" "$log_dir/b"
if grep -q MISSING_PATTERN "$log_dir/a" "$log_dir/b"; then exit 1; fi

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
port="${BYUS_CLEAN_DB_PORT:-55493}"
BYUS_CLEAN_DB_PORT="$port" bash "$root/scripts/verify-clean-migration-chain.sh" >"$tmp/one.log" 2>&1 &
one=$!
BYUS_CLEAN_DB_PORT="$port" bash "$root/scripts/verify-clean-migration-chain.sh" >"$tmp/two.log" 2>&1 &
two=$!
status=0
wait "$one" || { cat "$tmp/one.log" >&2; status=1; }
wait "$two" || { cat "$tmp/two.log" >&2; status=1; }
exit "$status"

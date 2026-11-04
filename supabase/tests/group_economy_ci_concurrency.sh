#!/usr/bin/env bash
set -euo pipefail
# Runs in order on one disposable database; each file owns distinct fixture ids.
# group_wallet_cross_feature_* and group_wallet_cutover_verify.sh need the disabled release baseline,
# so CI replays a fresh database for each of them.
dir="$(dirname "${BASH_SOURCE[0]}")"
bash "$dir/group_wallet_concurrency.sh"
bash "$dir/group_raffle_concurrency.sh"

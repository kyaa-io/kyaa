#!/usr/bin/env bash
# Section 15 follow-up concurrency tests in one disposable chain run. The claim test comes first: it activates the policy unconditionally, the others only when needed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/passport_claim_concurrency.sh"
bash "$HERE/passport_stacking_concurrency.sh"
bash "$HERE/passport_void_lock_order.sh"
bash "$HERE/passport_migration_rerun.sh"

#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$(psql -X -Atq -v ON_ERROR_STOP=1 -c "select current_database()||'|'||(inet_server_addr()is null)::text")" != 'byus_clean|true' ]];then
 echo 'Disposable Unix-socket byus_clean required' >&2
 exit 1
fi
psql -X -q -v ON_ERROR_STOP=1 -f "$root/supabase/tests/group_wallet_cross_feature.sql"
outputs="$(mktemp -d)"
cleanup(){ rm -f "$outputs/before.json" "$outputs/after.json" "$outputs/audit.json";rmdir "$outputs"; }
trap cleanup EXIT
psql -X -Atq -v ON_ERROR_STOP=1 -f "$root/scripts/groups-wallet-cutover-snapshot.sql" > "$outputs/before.json"
psql -X -q -v ON_ERROR_STOP=1 -c 'update public.group_wallet_release set write_fenced=true where singleton'
psql -X -Atq -v ON_ERROR_STOP=1 -f "$root/scripts/groups-wallet-cutover-snapshot.sql" > "$outputs/after.json"
psql -X -Atq -v ON_ERROR_STOP=1 -f "$root/scripts/groups-wallet-cutover-audit.sql" > "$outputs/audit.json"
python3 - "$outputs" <<'PY'
import json,sys
from pathlib import Path
base=Path(sys.argv[1])
before=json.loads((base/'before.json').read_text());after=json.loads((base/'after.json').read_text());audit=json.loads((base/'audit.json').read_text())
assert before['schemaVersion']==after['schemaVersion']==audit['schemaVersion']==1
for key in ['fingerprints','assets','paidVotes']:
 assert before[key]==after[key],key+' changed with only release fence'
assert before['fingerprints']['mobile_fan_economy_requests']['rows']>=1
assert before['fingerprints']['mobile_vote_purchase_lots']['rows']>=1
assert before['paidVotes']['pendingTransactions']>=1
assert before['paidVotes']['refundReviewLots']>=1
assert before['paidVotes']['invalidLots']==0
assert all(a['negativeOwners']==a['overflowOwners']==0 for a in before['assets'].values())
assert audit['lockAudit']['unguardedPresentRoutines']==0,audit['lockAudit']
assert audit['privateMintAclLeaks']==0
assert audit['manualSourceAndDeploymentReviewRequired'] is True
assert audit['canObserveAllSessions'] is True
assert audit['release']['enabled'] is True and audit['release']['write_fenced'] is True
print('PASS read-only cutover financial/paid-rights snapshot invariant and runtime guard/ACL observations')
print(json.dumps({'guardedRoutines':len(audit['lockAudit']['routines']),'absentLegacyNames':audit['lockAudit']['absentLegacyNames'],'directLedgerWriters':len(audit['directLedgerWriters']),'productionExecuted':False}))
PY
psql -X -q -v ON_ERROR_STOP=1 -f "$root/supabase/tests/group_wallet_cutover.sql"

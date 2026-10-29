#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -X -v ON_ERROR_STOP=1 -c "do \$\$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end\$\$;"
for fixture in fan_membership_certifications kyaa_existing_credential_replacements; do
  psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/$fixture.sql"
done
old_job='d2000000-0000-4000-8000-000000000001'
psql -X -v ON_ERROR_STOP=1 -c "insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values('$old_job','stamp','$old_job','byus:stamp:v1:$old_job',1,'{\"recipient\":\"0xd100000000000000000000000000000000000001\",\"celebritySlug\":\"old-job\",\"issuanceId\":\"0x$(printf '%064d' 1)\",\"stampType\":\"Membership\"}');"
old_job_before=$(psql -X -At -v ON_ERROR_STOP=1 -c "select md5(to_jsonb(j)::text) from public.blockchain_jobs j where id='$old_job'")
psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/legacy_stamp_binding_v2_cutover.sql"
old_job_after=$(psql -X -At -v ON_ERROR_STOP=1 -c "select md5(to_jsonb(j)::text) from public.blockchain_jobs j where id='$old_job'")
[[ "$old_job_before" == "$old_job_after" ]] || { echo 'Cutover changed existing job' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 -c "delete from public.blockchain_jobs where id='$old_job'"

if drift_output=$(psql -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/legacy_stamp_binding_v2_cutover.sql" 2>&1); then
  echo 'Repeated cutover unexpectedly accepted a changed fingerprint' >&2; exit 1
fi
case "$drift_output" in *LEGACY_STAMP_CUTOVER_FUNCTION_DRIFT*) ;; *) echo "$drift_output" >&2; exit 1;; esac
for fixture in fan_membership_certifications mobile_fan_membership_cutover; do
  python3 - "$ROOT/supabase/tests/$fixture.sql" <<'PYFIXTURE' | psql -X -v ON_ERROR_STOP=1 -f - -f "$ROOT/supabase/tests/legacy_stamp_binding_v2.sql" -c rollback
from pathlib import Path
import sys
fixture=Path(sys.argv[1])
text=fixture.read_text().replace('rollback;', '')
if fixture.stem=='mobile_fan_membership_cutover':
    marker="insert into public.mobile_fan_economy_policies("
    start=text.index(marker); end=text.index('\n',start)
    setup="\ninsert into public.mobile_fan_earning_cutovers(celebrity_id,policy_id,effective_at,version) select celebrity_id,id,effective_at,version from public.mobile_fan_economy_policies where version='membership-point-fixture';"
    text=text[:end]+setup+text[end:]
print(text)
PYFIXTURE
done

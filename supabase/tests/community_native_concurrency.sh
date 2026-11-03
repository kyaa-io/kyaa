#!/usr/bin/env bash
# Run through verify-clean-migration-chain.sh after community_native.sql, disposable DB only.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql_args=(-X -v ON_ERROR_STOP=1)
# Existing realistic passport/share fixtures, isolated under distinct IDs and names.
python3 - "$ROOT_DIR/supabase/tests/community_stamp_share_concurrency.sql" <<'PYFIXTURE' | psql "${psql_args[@]}" >/dev/null
from pathlib import Path
import sys
fixture = Path(sys.argv[1]).read_text()
for old, new in [('fc130000', 'fc150000'), ('community-share-race', 'community-native-race'),
                 ('community_share_race', 'community_native_race'), ('share-race', 'native-race'), ('cccc', 'dddd')]:
    fixture = fixture.replace(old, new)
# Published creators must already have registration evidence for the active binding.
anchor = "update public.celebrities set status='published'"
assert fixture.count(anchor) == 1
registration = """insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at)
values('fa140000-0000-4000-8000-000000000001','fc150000-0000-4000-8000-000000000001',1,'0x'||repeat('6',64),now());
"""
print(fixture.replace(anchor, registration + anchor))
PYFIXTURE
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.fan_clips(id,app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash)
values('fc150000-0000-4000-8000-000000000091','fc150000-0000-4000-8000-000000000011','fc150000-0000-4000-8000-000000000001','Native clip fixture','public','fc150000-0000-4000-8000-000000000091',repeat('0',64));
SQL
race_visit() {
  psql "${psql_args[@]}" -c "select public.visit_community_stamp_share_link('$2',token) from public.community_native_race_tokens where owner_id='$1';" >/dev/null
}
race_clip() {
  psql "${psql_args[@]}" -c "select public.issue_community_stamp('fc150000-0000-4000-8000-000000000011','fc150000-0000-4000-8000-000000000001','first_clip','first-clip:fc150000-0000-4000-8000-000000000091');" >/dev/null
}
race_visit fc150000-0000-4000-8000-000000000011 fc150000-0000-4000-8000-000000000021 & first=$!
race_visit fc150000-0000-4000-8000-000000000011 fc150000-0000-4000-8000-000000000021 & second=$!
wait "$first"; wait "$second"
race_visit fc150000-0000-4000-8000-000000000012 fc150000-0000-4000-8000-000000000021 & first=$!
race_visit fc150000-0000-4000-8000-000000000012 fc150000-0000-4000-8000-000000000022 & second=$!
wait "$first"; wait "$second"
race_clip & first=$!
race_clip & second=$!
wait "$first"; wait "$second"
psql "${psql_args[@]}" <<'SQL'
do $$
begin
  if (select count(*) from public.community_stamps where app_user_id in
      ('fc150000-0000-4000-8000-000000000011','fc150000-0000-4000-8000-000000000012')
      and kind='share' and fan_action_outbox_id is not null and blockchain_job_id is null)<>2
    or (select count(*) from public.community_stamps where app_user_id='fc150000-0000-4000-8000-000000000011'
      and kind='first_clip' and fan_action_outbox_id is not null and blockchain_job_id is null)<>1
    or (select count(*) from public.community_stamp_share_visits visit join public.community_stamp_share_links link on link.id=visit.share_link_id
      where link.owner_app_user_id='fc150000-0000-4000-8000-000000000011')<>1
    or (select count(*) from public.community_stamp_share_visits visit join public.community_stamp_share_links link on link.id=visit.share_link_id
      where link.owner_app_user_id='fc150000-0000-4000-8000-000000000012')<>2
    or (select count(*) from public.fan_action_outbox outbox join public.fan_action_occurrences occurrence on occurrence.id=outbox.occurrence_row_id
      where occurrence.app_user_id in ('fc150000-0000-4000-8000-000000000011','fc150000-0000-4000-8000-000000000012')
      and outbox.source_snapshot->>'actionCode'='12')<>3 then
    raise exception 'COMMUNITY_NATIVE_CONCURRENCY_FAILED';
  end if;
end $$;
select 'COMMUNITY_NATIVE_CONCURRENCY_PASS' result;
SQL

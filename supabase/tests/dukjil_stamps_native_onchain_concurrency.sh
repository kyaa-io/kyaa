#!/usr/bin/env bash
# ONCHAIN-STAMPS-IMPL-1117 races on a disposable clean-chain DB with 20261229000000 applied (commits fixtures; never a shared DB).
# 1. The same dukjil stamp issued from two sessions -> one stamp, one outbox.
# 2. Two recovery runs at once under a daily cap of 12 -> 12 enqueued in total, one outbox per stamp, rerun adds nothing.
# 3. A registration and a release at once -> each held stamp gets exactly one outbox.
set -euo pipefail
[[ -n "${PGHOST:-}" && "${PGHOST:0:1}" == / ]] || { echo 'Unix-socket PGHOST of a disposable DB required' >&2; exit 2; }
psql_args=(-X -v ON_ERROR_STOP=1 -q -At)
psql "${psql_args[@]}" <<'SQL' >/dev/null
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now()
  where version=(select max(version) from public.dukjil_policy_versions);
update public.mint_dispatch_policy set legacy_credential_issuance_retired=true;
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
values('0c6f0000-0000-4000-8000-000000000001',91342,'0x'||repeat('1',64),'0x'||repeat('2',40),'0x'||repeat('3',40),'0x'||repeat('4',64),1,2,
  'ipfs://bafydukjilrace',jsonb_build_object('1','0x'||repeat('5',40)));
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,enabled_at,policy_version)
select code,'0c6f0000-0000-4000-8000-000000000001',true,now(),1 from unnest(array[10,12]) code;
insert into public.app_users(id,privy_user_id,verified_email,status)
select ('0c600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'did:privy:ocs-race-'||n,'ocs-race-'||n||'@byus.test','active' from generate_series(1,3) n;
insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
select ('0c600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,91342,'0x'||lpad(n::text,40,'d'),'privy','embedded' from generate_series(1,3) n;
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
select ('0c610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ocs-race-'||n,'draft','/d.webp','{artist}','idol' from generate_series(1,2) n;
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
select ('0c610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l,'가','가','가' from generate_series(1,2) n, unnest(array['ko','en']::public.content_locale[]) l;
update public.celebrities set status='published',published_at=now() where slug like 'ocs-race-%';
insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at)
values('0c6f0000-0000-4000-8000-000000000001','0c610000-0000-4000-8000-000000000001',1,'0x'||repeat('6',64),now());
-- 20 backlog stamps written the way the pre-migration issuer did.
do $$
declare i integer; v_id uuid; v_job uuid; v_op text; u uuid:='0c600000-0000-4000-8000-000000000001'; c uuid:='0c610000-0000-4000-8000-000000000001';
begin
  for i in 1..20 loop
    v_id:=extensions.gen_random_uuid(); v_job:=extensions.gen_random_uuid(); v_op:='byus:community-stamp:v1:'||v_id::text;
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
      values(v_job,'community_stamp',v_id,v_op,1,jsonb_build_object('recipient','0x'||lpad('1',40,'d'),
        'issuanceId','0x'||encode(extensions.digest(v_op,'sha256'),'hex'),'stampKind','post','celebritySlug','ocs-race-1'));
    insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,blockchain_job_id,policy_version,issued_at)
      values(v_id,u,c,'post','race-backlog:'||i,v_job,2,timestamptz '2026-11-12 09:00:00+09'+i*interval '1 minute');
  end loop;
end $$;
SQL
hash=$(psql "${psql_args[@]}" -c "select public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', now(), 12)->>'manifestHash'")

# 1. same stamp from two sessions
issue="select public.dukjil_issue_stamp('0c600000-0000-4000-8000-000000000002','0c610000-0000-4000-8000-000000000001','quiz','race:quiz',2)"
psql "${psql_args[@]}" -c "$issue" > /dev/null & psql "${psql_args[@]}" -c "$issue" > /dev/null & wait
# 2. two recovery runs at once
psql "${psql_args[@]}" -c "select public.run_community_stamp_recovery('$hash',10)" > /dev/null &
psql "${psql_args[@]}" -c "select public.run_community_stamp_recovery('$hash',10)" > /dev/null & wait
psql "${psql_args[@]}" -c "select public.run_community_stamp_recovery('$hash',10)" > /dev/null
# 3. held stamps, then registration and release at once
psql "${psql_args[@]}" -c "select public.dukjil_issue_stamp('0c600000-0000-4000-8000-000000000003','0c610000-0000-4000-8000-000000000002',k::public.community_stamp_kind,'race:held:'||k,2) from unnest(array['post','quiz','cheer']) k" > /dev/null
psql "${psql_args[@]}" -c "insert into public.fan_action_verified_creators(binding_id,creator_id,verified_block_number,verified_block_hash,verified_at) values('0c6f0000-0000-4000-8000-000000000001','0c610000-0000-4000-8000-000000000002',2,'0x'||repeat('7',64),now())" > /dev/null &
psql "${psql_args[@]}" -c "select public.release_held_community_stamps(null,100)" > /dev/null & wait

result=$(psql "${psql_args[@]}" <<SQL
select concat_ws(' ',
  (select count(*) from public.community_stamps where app_user_id='0c600000-0000-4000-8000-000000000002' and source_key='race:quiz'),
  (select count(*) from public.fan_action_credentials c join public.community_stamps s on s.id=c.entity_id where s.source_key='race:quiz'),
  (select count(*) from public.community_stamp_recovery_items where manifest_hash='$hash' and outbox_id is not null),
  (select count(*) from public.fan_action_credentials c join public.community_stamp_recovery_items i on i.stamp_id=c.entity_id and i.manifest_hash='$hash'),
  (select count(distinct entity_id) from public.fan_action_credentials c join public.community_stamp_recovery_items i on i.stamp_id=c.entity_id and i.manifest_hash='$hash'),
  (select count(*) from public.community_stamps where app_user_id='0c600000-0000-4000-8000-000000000003' and fan_action_outbox_id is not null and onchain_hold_reason is null),
  (select count(*) from public.fan_action_credentials c join public.community_stamps s on s.id=c.entity_id where s.app_user_id='0c600000-0000-4000-8000-000000000003'))
SQL
)
[[ "$result" == "1 1 12 12 12 3 3" ]] || { echo "DUKJIL_NATIVE_RACE_FAILED: $result" >&2; exit 1; }
echo "DUKJIL_NATIVE_RACE_OK $result"

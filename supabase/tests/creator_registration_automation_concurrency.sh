#!/usr/bin/env bash
set -euo pipefail
# Only run against the disposable database created by verify-clean-migration-chain.sh.
[[ "${PGDATABASE:-}" == byus_clean && -n "${PGHOST:-}" && -n "${PGPORT:-}" ]]
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
values('ea000000-0000-4000-8000-000000000001',91342,'0x'||repeat('1',64),'0x'||repeat('7',40),'0x'||repeat('6',40),'0x'||repeat('1',64),1,3,'ipfs://bafyfixture','{}');
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at)
values(6,'ea000000-0000-4000-8000-000000000001',true,1,clock_timestamp()) on conflict(action_code) do update set binding_id=excluded.binding_id,enabled=true,enabled_at=excluded.enabled_at;
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values
('ea000000-0000-4000-8000-000000000002','registration-concurrent-first','draft','/test.webp','{artist}','idol'),
('ea000000-0000-4000-8000-000000000003','registration-concurrent-second','draft','/test.webp','{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) select c.id,l.locale,'Registration fixture','Registration fixture summary','Registration fixture image' from public.celebrities c cross join unnest(enum_range(null::public.content_locale)) l(locale) where c.id in ('ea000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000003');
SQL
wait_checkpoint() {
  for _ in {1..80}; do
    [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]] && return 0
    sleep 0.1
  done
  echo "Missing concurrent checkpoint: $1" >&2
  return 1
}
PGAPPNAME=registration_publish_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
update public.celebrities set status='published',published_at=clock_timestamp() where id='ea000000-0000-4000-8000-000000000002';
select pg_sleep(2);
commit;
SQL
holder=$!
wait_checkpoint registration_publish_holder
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
update public.celebrities set status='published',published_at=clock_timestamp() where id='ea000000-0000-4000-8000-000000000002';
update public.celebrities set status='published',published_at=clock_timestamp() where id='ea000000-0000-4000-8000-000000000003';
do $$ begin if (select count(*) from public.creator_registration_jobs where binding_id='ea000000-0000-4000-8000-000000000001' and creator_id='ea000000-0000-4000-8000-000000000002')<>1 then raise exception 'concurrent publication duplicated job'; end if; end $$;
update public.creator_registration_jobs set registrar='0x'||repeat('6',40),lease_owner='concurrent',lease_fence=1,lease_expires_at=clock_timestamp()+interval '2 minutes' where binding_id='ea000000-0000-4000-8000-000000000001';
SQL
wait "$holder"
# Each transaction owns a different job. Only the shared signer advisory lock can serialize them.
reserve_sql() {
  cat <<SQL
select public.creator_registration_transition(j.id,'concurrent',1,'reserve',jsonb_build_object('nonce','$2','envelope',jsonb_build_object('chainId',91342,'to','0x4e104e5dfb3d466a2aac9ed0cf7572578068529b','data',public.creator_registration_calldata(j.id),'value','0','nonce','$2','gasLimit','150000','maxFeePerGas','100000000','maxPriorityFeePerGas','0'))) from public.creator_registration_jobs j where j.binding_id='ea000000-0000-4000-8000-000000000001' and j.creator_id='$1';
SQL
}
{
  echo 'begin;'
  reserve_sql ea000000-0000-4000-8000-000000000002 77
  echo 'select pg_sleep(2); commit;'
} | PGAPPNAME=registration_nonce_holder psql -X -v ON_ERROR_STOP=1 -q >/dev/null &
holder=$!
wait_checkpoint registration_nonce_holder
result="$(reserve_sql ea000000-0000-4000-8000-000000000003 78 | psql -X -v ON_ERROR_STOP=1 -q 2>&1)" && { echo 'Concurrent nonce was admitted' >&2; exit 1; }
[[ "$result" == *REGISTRATION_NONCE_BLOCKED* ]] || { echo "$result" >&2; exit 1; }
wait "$holder"
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin if (select count(*) from public.creator_registration_attempts where registrar='0x'||repeat('6',40))<>1 then raise exception 'nonce serialization failed'; end if; end $$;
SQL
echo 'Creator registration publication and nonce concurrency passed'

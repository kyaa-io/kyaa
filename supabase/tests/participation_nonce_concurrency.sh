#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGDATABASE:?}"
if [[ "$PGDATABASE" != byus_clean || "$PGHOST" != /*/byus-clean-db.*/socket || ! -S "$PGHOST/.s.PGSQL.$PGPORT" ]]; then
 echo 'Disposable local database required' >&2;exit 1
fi
nonce_tmp="$(mktemp -d)"
nonce_cleanup() {
 nonce_status=$?
 if [[ "$nonce_status" != 0 ]]; then cat "$nonce_tmp/a.log" "$nonce_tmp/b.log" >&2 2>/dev/null || true;fi
 rm -f "$nonce_tmp/a.log" "$nonce_tmp/b.log"
 rmdir "$nonce_tmp"
}
trap nonce_cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create function public.participation_nonce_test_pause()returns trigger language plpgsql as $$begin
 if old.signed_transaction is null and new.signed_transaction is not null then perform pg_sleep(2);end if;return new;end $$;
create trigger participation_nonce_pause before update on public.participation_batches for each row execute function public.participation_nonce_test_pause();
insert into public.participation_batches(id,chain_id,contract_address,relayer,items,payload,status,lease_owner,lease_expires_at)
values('93900000-0000-4000-8000-000000000001',91342,'0x'||repeat('a',40),'0x'||repeat('b',40),'[{}]','{}','PROCESSING','nonce-A',clock_timestamp()+interval '5 minutes');
insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload,status,lease_owner,lease_expires_at)
values('93900000-0000-4000-8000-000000000002','passport','93900000-0000-4000-8000-000000000003','nonce-race-fixture','{}','PROCESSING','nonce-B',clock_timestamp()+interval '5 minutes');
insert into public.chain_writer_leases(chain_id,relayer,job_family,job_id,worker_id,expires_at)
values(91342,'0x'||repeat('b',40),'participation','93900000-0000-4000-8000-000000000001','nonce-A',clock_timestamp()+interval '500 milliseconds');
SQL
PGAPPNAME=participation-nonce-A psql -X -v ON_ERROR_STOP=1 -qAt -c "select (public.record_prepared_participation_batch('93900000-0000-4000-8000-000000000001','nonce-A','0x'||repeat('c',64),'0x1234')).id" >"$nonce_tmp/a.log" 2>&1 &
nonce_pid=$!
nonce_waited=false
for _ in {1..100}; do
 if [[ "$(psql -X -qAt -c "select exists(select 1 from pg_stat_activity where application_name='participation-nonce-A' and wait_event='PgSleep') and exists(select 1 from public.chain_writer_leases where job_id='93900000-0000-4000-8000-000000000001' and expires_at<clock_timestamp())")" == t ]]; then nonce_waited=true;break;fi
 sleep 0.03
done
if [[ "$nonce_waited" != true ]]; then cat "$nonce_tmp/a.log";echo 'Did not observe prepared persistence spanning lease expiry' >&2;exit 1;fi
psql -X -v ON_ERROR_STOP=1 -qAt -c "select public.admit_chain_writer('legacy','93900000-0000-4000-8000-000000000002','nonce-B',91342,'0x'||repeat('b',40),120)" >"$nonce_tmp/b.log" 2>&1
wait "$nonce_pid"
[[ "$(cat "$nonce_tmp/b.log")" == f ]]
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$declare f text;body text;begin
 assert(select signed_transaction='0x1234'from public.participation_batches where id='93900000-0000-4000-8000-000000000001');
 assert(select status='RETRYING' and last_error_code='CHAIN_WRITER_BUSY'from public.blockchain_jobs where id='93900000-0000-4000-8000-000000000002');
 assert(select job_family='participation'from public.chain_writer_leases where chain_id=91342 and relayer='0x'||repeat('b',40));
 foreach f in array array['public.admit_chain_writer(text,uuid,text,bigint,text,integer)','public.record_prepared_participation_batch(uuid,text,text,text)','public.record_prepared_fan_action_job(uuid,text,text,text)','public.record_prepared_blockchain_job(uuid,text,text,text)']loop
 select pg_get_functiondef(f::regprocedure)into body;
 assert position('pg_advisory_xact_lock' in body)>0 and position('chain-writer:'in body)>0,f||' must share the transaction fence';
 end loop;
end $$;
-- Legacy preparation also checks the shared lease and freezes signed bytes.
update public.participation_batches set status='COMPLETED',lease_owner=null,lease_expires_at=null where id='93900000-0000-4000-8000-000000000001';
select public.release_chain_writer('participation','93900000-0000-4000-8000-000000000001','nonce-A',91342,'0x'||repeat('b',40));
update public.blockchain_jobs set status='PROCESSING',lease_owner='nonce-B',lease_expires_at=clock_timestamp()+interval '2 minutes'where id='93900000-0000-4000-8000-000000000002';
do $$declare q public.blockchain_jobs;rejected boolean:=false;begin
 assert public.admit_chain_writer('legacy','93900000-0000-4000-8000-000000000002','nonce-B',91342,'0x'||repeat('b',40),120);
 q:=public.record_prepared_blockchain_job('93900000-0000-4000-8000-000000000002','nonce-B','0x'||repeat('d',64),'0x3456');
 assert q.payload->'workerSubmission'->>'signedTransaction'='0x3456';
 q:=public.record_prepared_blockchain_job(q.id,'nonce-B',q.tx_hash,'0x3456');
 begin perform public.record_prepared_blockchain_job(q.id,'nonce-B',q.tx_hash,'0x9999');exception when others then
 assert position('conflicts' in sqlerrm)>0;rejected:=true;end;
 assert rejected,'legacy persisted bytes must remain immutable';
 update public.chain_writer_leases set expires_at=clock_timestamp()-interval '1 second'where job_id=q.id;
 rejected:=false;
 begin perform public.record_prepared_blockchain_job(q.id,'nonce-B',q.tx_hash,'0x3456');exception when others then
 assert sqlerrm='CHAIN_WRITER_LEASE_LOST';rejected:=true;end;
 assert rejected,'legacy preparation must reject an expired writer lease';
end $$;
drop trigger participation_nonce_pause on public.participation_batches;
drop function public.participation_nonce_test_pause();
SQL
printf '%s\n' 'Prepared persistence versus expired writer takeover: passed.'

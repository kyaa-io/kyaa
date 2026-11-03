#!/usr/bin/env bash
set -euo pipefail
# The clean-migration runner supplies a disposable Unix-socket database.
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
insert into public.app_users(id,privy_user_id,verified_email)values('e9100000-0000-4000-8000-000000000001','did:privy:wallet-concurrency','wallet-race@example.test');
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
select public.group_wallet_post('e9100000-0000-4000-8000-000000000001','ticket',1,'group_exchange','e9100000-0000-4000-8000-000000000002');
SQL
log_dir="$(mktemp -d)"
trap 'rm -f "$log_dir/a" "$log_dir/b";rmdir "$log_dir"' EXIT
race() {
 psql -X -v ON_ERROR_STOP=1 >"$log_dir/$1" 2>&1 <<SQL
begin;
select public.group_wallet_lock('e9100000-0000-4000-8000-000000000001');
select pg_sleep(0.2);
select public.group_wallet_post('e9100000-0000-4000-8000-000000000001','ticket',-1,'group_capsule','$2');
commit;
SQL
}
race a e9100000-0000-4000-8000-000000000003 & first=$!
race b e9100000-0000-4000-8000-000000000004 & second=$!
a=0;b=0
wait "$first" || a=$?
wait "$second" || b=$?
if [[ "$a" == 0 && "$b" == 0 || "$a" != 0 && "$b" != 0 ]]; then cat "$log_dir/a" "$log_dir/b";exit 1;fi
cat "$log_dir/a" "$log_dir/b" | grep -q GROUP_WALLET_INSUFFICIENT_BALANCE
# Opposite inviter/invitee order must complete without deadlock.
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.app_users(id,privy_user_id,verified_email)values('e9100000-0000-4000-8000-000000000005','did:privy:wallet-inviter','wallet-inviter@example.test');
SQL
pair() {
 psql -X -v ON_ERROR_STOP=1 >"$log_dir/$1" 2>&1 <<SQL
begin;
set local statement_timeout='5s';
select public.group_wallet_invitation_lock('$2','$3');
select pg_sleep(0.2);
select public.group_wallet_lock('$3');
select public.group_wallet_lock('$2');
commit;
SQL
}
pair a e9100000-0000-4000-8000-000000000001 e9100000-0000-4000-8000-000000000005 & first=$!
pair b e9100000-0000-4000-8000-000000000005 e9100000-0000-4000-8000-000000000001 & second=$!
wait "$first" || { cat "$log_dir/a";exit 1; }
wait "$second" || { cat "$log_dir/b";exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$begin
 if public.group_wallet_balance('e9100000-0000-4000-8000-000000000001','ticket')<>0 or(select count(*)from public.fan_ticket_ledger where app_user_id='e9100000-0000-4000-8000-000000000001'and amount<0)<>1 then raise exception 'Concurrent ticket debit overdraft';end if;
 if(select sequence from public.group_wallet_owner_sequences where app_user_id='e9100000-0000-4000-8000-000000000001')<>2 then raise exception 'Failed debit advanced global sequence';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('submit_owned_quiz_attempt','submit_owned_quiz_attempt_fw_f5930695','redeem_community_stamp_invite')and position('begin perform public.group_wallet_invitation_lock'in prosrc)=0)then raise exception 'Invitation producer does not acquire pair barrier first';end if;
 raise notice 'PASS reciprocal invitation pair lock without deadlock';
 raise notice 'PASS concurrent shared ticket consumers serialize, one debit, zero overdraft, no failed sequence';
end $$;
SQL

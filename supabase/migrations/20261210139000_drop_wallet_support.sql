-- PASSPORT-RENEWAL P2 (follow-up, PR-P2-DB-2 item 6): the heart transfer RPC goes away with the heart exchange (conflicts.md 1-A, routes.ts support).
-- Hearts are now earned only by passport pages (contract section 2), so a transfer of purchased hearts has no source left. Old ledger rows,
-- receipts and the support_voucher asset value stay untouched. Nothing in apps/, scripts/ or other migrations calls it (checked with rg).

do $migration$
declare f record; dropped integer := 0;
begin
  for f in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'send_owned_group_wallet_support'
  loop
    execute format('drop function %s', f.sig);
    dropped := dropped + 1;
  end loop;
  if dropped <> 1 then raise exception 'SEND_SUPPORT_DROP_UNEXPECTED: dropped %', dropped; end if;
end $migration$;

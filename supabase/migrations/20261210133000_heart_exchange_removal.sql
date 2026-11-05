-- PASSPORT-RENEWAL P2 (4/8): hearts can no longer be bought with points. Only the heart parts of exchange_owned_group_wallet
-- go: the target check now allows 'ticket' only, the legacy heart-replay clause and the support_voucher credit are removed.
-- Ticket exchange, the ad session gate, the daily cap and the receipt insert stay as they are. Old heart receipts and ledger
-- rows stay untouched (read_owned_group_wallet_exchanges_remaining is not changed). A heart request now fails as GROUP_WALLET_INVALID.
-- send_owned_group_wallet_support is dropped in 20261210139000.

do $migration$
declare
  def text;
  a1 constant text := 'p_target not in(''heart'',''ticket'')';
  b1 constant text := 'p_target is distinct from ''ticket''';
  a2 constant text := ' and not(p_target=''heart''and not(original.input?''adSessionId'')and original.input=input-''adSessionId'')';
  a3 constant text := 'case when p_target=''heart''then ''support_voucher''else ''ticket''end';
  b3 constant text := '''ticket''';
begin
  select pg_get_functiondef('public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 then raise exception 'HEART_EXCHANGE_BRANCH_CHANGED: target check'; end if;
  if (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1 then raise exception 'HEART_EXCHANGE_BRANCH_CHANGED: legacy replay'; end if;
  if (length(def) - length(replace(def, a3, ''))) / length(a3) <> 1 then raise exception 'HEART_EXCHANGE_BRANCH_CHANGED: credit asset'; end if;
  def := replace(replace(replace(def, a1, b1), a2, ' '), a3, b3);
  execute def;
  if position('support_voucher' in pg_get_functiondef('public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure)) > 0 then
    raise exception 'HEART_EXCHANGE_BRANCH_CHANGED: support_voucher remains'; end if;
end $migration$;

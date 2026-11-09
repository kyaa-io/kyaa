-- B13: one rewarded ad buys N tickets in one exchange. exchange_owned_group_wallet loses only its two "a ticket is exactly 1 unit"
-- checks (one before the receipt replay, one before the new-request path). Everything else stays as it is:
--   * units stay 1..1000 (the first check of the function), the debit stays units*100 points (group_wallet_post refuses an overdraft
--     with GROUP_WALLET_INSUFFICIENT_BALANCE and the whole call rolls back, session included);
--   * one granted, unexpired, unconsumed ad session per exchange, consumed in the same transaction as the debit and the credit;
--   * the daily cap still counts consumed ad sessions (group_wallet_ad_consumed_today), so it counts exchanges, not tickets;
--   * the receipt input still holds units, so the same request key with another quantity is GROUP_WALLET_REQUEST_CONFLICT.
-- Signature, owner, security definer, search_path and grants are unchanged (create or replace of the same definition); the function
-- reads no table it did not read before, so the owner needs no new access.
-- Rollback: supabase/rollback/20261219070000_group_wallet_ticket_units.sql.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure;
  before_replay constant text := 'if p_target=''ticket''and p_units<>1 then raise exception ''GROUP_WALLET_INVALID'';end if;';
  before_debit constant text := 'if p_units<>1 then raise exception ''GROUP_WALLET_INVALID'';end if;';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if pg_catalog.strpos(definition, 'p_units<>1') = 0 then return; end if; -- already applied
  if (length(definition) - length(replace(definition, before_replay, ''))) / length(before_replay) <> 1 then raise exception 'GROUP_WALLET_TICKET_UNITS_SHAPE: replay check'; end if;
  if (length(definition) - length(replace(definition, before_debit, ''))) / length(before_debit) <> 1 then raise exception 'GROUP_WALLET_TICKET_UNITS_SHAPE: debit check'; end if;
  execute replace(replace(definition, before_replay, ''), before_debit, '');
  definition := pg_catalog.pg_get_functiondef(sig);
  if pg_catalog.strpos(definition, 'p_units<>1') > 0
     or pg_catalog.strpos(definition, 'p_units not between 1 and 1000') = 0
     or pg_catalog.strpos(definition, '-(p_units::bigint*100)') = 0
     or pg_catalog.strpos(definition, 'group_wallet_ad_consumed_today(p_app_user_id)>=p_daily_cap') = 0 then
    raise exception 'GROUP_WALLET_TICKET_UNITS_SHAPE: patched body';
  end if;
end
$patch$;

notify pgrst, 'reload schema';
commit;

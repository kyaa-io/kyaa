-- Rollback of 20261219070000_group_wallet_ticket_units.sql: a new ticket exchange is 1 unit per ad session again.
-- The check comes back on the new-request path only (before the ad-session check, where it was). The pre-replay check is not restored on
-- purpose: an N-unit exchange committed while the migration was live must keep replaying its stored result instead of turning into
-- GROUP_WALLET_INVALID, and its receipt and ledger rows stay untouched. A second run stops at GROUP_WALLET_TICKET_UNITS_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure;
  anchor constant text := 'if p_ad_session_id is null then raise exception ''GROUP_WALLET_AD_SESSION_REQUIRED'';end if;';
  check_units constant text := 'if p_units<>1 then raise exception ''GROUP_WALLET_INVALID'';end if;';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if pg_catalog.strpos(definition, 'p_units<>1') > 0 then raise exception 'GROUP_WALLET_TICKET_UNITS_ROLLBACK_SHAPE: already 1 unit'; end if;
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then raise exception 'GROUP_WALLET_TICKET_UNITS_ROLLBACK_SHAPE: anchor'; end if;
  execute replace(definition, anchor, check_units || anchor);
end
$patch$;

notify pgrst, 'reload schema';
commit;

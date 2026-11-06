-- Rollback for 20261212070000_passport_issuance_without_first_stamp.sql: restores the raise for a Passport without a first knowledge stamp.
-- Web either order: the new web already shows its error screen with an open-Passport action when this RPC raises.
begin;
do $rollback$
declare
  def text;
begin
  select pg_get_functiondef('public.get_owned_passport_issuance(uuid,uuid,public.content_locale)'::regprocedure) into strict def;
  if position('credential_count > 1' in def) = 0 then raise exception 'PASSPORT_ISSUANCE_ROLLBACK_ANCHOR_CHANGED'; end if;
  execute replace(def, 'credential_count > 1', 'credential_count <> 1');
end $rollback$;
commit;

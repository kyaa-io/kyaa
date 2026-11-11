-- Preserve the current ticket-only, multi-unit exchange contract and all later body patches.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  sig constant regprocedure := 'public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure;
  lock_call constant text := 'perform public.group_wallet_lock(p_app_user_id);';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if (length(definition) - length(replace(definition, lock_call, ''))) / length(lock_call) <> 1 then
    raise exception 'GROUP_WALLET_EXCHANGE_LOCK_TIME_SHAPE';
  end if;
  execute replace(definition, lock_call, lock_call || E'\n at_time:=clock_timestamp();');
end
$patch$;
commit;

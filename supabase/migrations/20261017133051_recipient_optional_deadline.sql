-- Keep the active-account wrapper and update its recipient validation delegate.
do $$
declare
  v_definition text;
  v_count integer;
  v_old constant text := 'fulfillment.recipient_deadline_at is null or v_now>=fulfillment.recipient_deadline_at';
  v_new constant text := 'fulfillment.recipient_deadline_at is not null and v_now>=fulfillment.recipient_deadline_at';
begin
  select count(*), min(pg_get_functiondef(p.oid)) into v_count, v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (p.proname='save_owned_benefit_recipient_v2'
      or starts_with(p.proname, 'save_owned_benefit_recipient_v2_fw_'))
    and position(v_old in pg_get_functiondef(p.oid))>0;
  if v_count<>1 then
    raise exception 'Expected one recipient deadline validator, found %', v_count;
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

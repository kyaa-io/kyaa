-- MIGRATION: normal analytics daily-cap drops must not produce PostgREST 5xx.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  signature regprocedure := 'public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure;
  definition text;
  anchor text := $a$raise exception 'PRODUCT_EVENT_RATE_LIMITED' using errcode = '54000';$a$;
begin
  definition := pg_catalog.pg_get_functiondef(signature);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'PRODUCT_EVENT_DAILY_CAP_CONTRACT_CHANGED';
  end if;
  execute replace(definition, anchor,
    $a$return pg_catalog.jsonb_build_object('skipped', true, 'reason', 'daily_cap');$a$);
end
$patch$;
commit;

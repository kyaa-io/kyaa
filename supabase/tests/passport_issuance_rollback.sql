\set ON_ERROR_STOP on
-- Applied (by the chain), rolled back, applied again. A disposable database only.
\ir passport_issuance_without_first_stamp.sql
\ir ../rollback/20261212070000_passport_issuance_without_first_stamp.sql
do $$
declare r jsonb; raised boolean := false; definition text;
begin
  definition := pg_get_functiondef('public.get_owned_passport_issuance(uuid,uuid,public.content_locale)'::regprocedure);
  if position('credential_count <> 1' in definition) = 0 then raise exception 'rollback did not restore the guard'; end if;
  begin
    perform public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','ko');
  exception when others then raised := sqlerrm = 'issued reward aggregate is inconsistent'; end;
  if not raised then raise exception 'rollback must raise for a Passport without a first stamp'; end if;
  r := public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','ko');
  if r->'firstStamp'->>'type' <> 'knowledge' or (r->'score'->>'points')::integer <> 1 then raise exception 'rollback changed a complete Passport %', r; end if;
  if has_function_privilege('anon','public.get_owned_passport_issuance(uuid,uuid,public.content_locale)','execute') or has_function_privilege('authenticated','public.get_owned_passport_issuance(uuid,uuid,public.content_locale)','execute') or not has_function_privilege('service_role','public.get_owned_passport_issuance(uuid,uuid,public.content_locale)','execute') then raise exception 'rollback changed the grants'; end if;
end $$;
\ir ../migrations/20261212070000_passport_issuance_without_first_stamp.sql
do $$
declare r jsonb;
begin
  r := public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','ko');
  if jsonb_typeof(r->'firstStamp') <> 'null' or (r->'score'->>'points')::integer <> 0 then raise exception 'reapply empty %', r; end if;
  r := public.get_owned_passport_issuance('fc240000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000003','ko');
  if r->'firstStamp'->>'type' <> 'knowledge' or (r->'score'->>'points')::integer <> 1 then raise exception 'reapply full %', r; end if;
  if has_function_privilege('anon','public.get_owned_passport_issuance(uuid,uuid,public.content_locale)','execute') or not has_function_privilege('service_role','public.get_owned_passport_issuance(uuid,uuid,public.content_locale)','execute') then raise exception 'reapply changed the grants'; end if;
end $$;

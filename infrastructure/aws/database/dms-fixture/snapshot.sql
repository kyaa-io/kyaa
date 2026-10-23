-- Identical canonical value digest on source/target, including stored generation and identity values.
do $$begin if current_database() not in('byus_dms_fixture_source','byus_dms_fixture_target') or current_user<>current_database() then raise exception 'Fixture DB/owner identity required'; end if;end $$;
select jsonb_build_object(
 'owners',(select jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text,'UTF8')),'hex')) from byus_dms_fixture.owners t),
 'records',(select jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'owner_id',owner_id,'payload',payload,'document',document,'dataHex',encode(data,'hex'),'tags',tags,'fixedExact',fixed_num::text,'unboundedExact',unbounded_num::text,'mood',mood::text,'generated_fingerprint',generated_fingerprint) order by id),'[]')::text,'UTF8')),'hex')) from byus_dms_fixture.records),
 'barriers',(select jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text,'UTF8')),'hex')) from byus_dms_fixture.barriers t),
 'phase',case when exists(select from byus_dms_fixture.barriers where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then 'cdc-complete' when exists(select from byus_dms_fixture.barriers where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then 'initial' else 'empty' end,
 'rollbackAbsent',not exists(select from byus_dms_fixture.owners where id='99999999-9999-4999-8999-999999999999') and not exists(select from byus_dms_fixture.records where payload='ROLLBACK must never arrive'),
 'foreignKeysValid',not exists(select from byus_dms_fixture.records r left join byus_dms_fixture.owners o on o.id=r.owner_id where o.id is null),
 'generationValid',not exists(select from byus_dms_fixture.records where generated_fingerprint<>md5(payload||':'||owner_id::text)),
 'identityDefinition',(select attidentity from pg_attribute where attrelid='byus_dms_fixture.records'::regclass and attname='id')
);

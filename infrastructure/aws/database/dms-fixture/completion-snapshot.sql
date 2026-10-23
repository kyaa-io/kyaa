do $$begin if current_database() not in('byus_dms_fixture_source','byus_dms_fixture_target') or current_user<>current_database() then raise exception 'Fixture DB/owner identity required'; end if;end $$;
select jsonb_build_object(
 'textKeys',(select jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]')::text,'UTF8')),'hex')) from byus_dms_fixture.text_keys t),
 'compositeKeys',(select jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by tenant,id),'[]')::text,'UTF8')),'hex')) from byus_dms_fixture.composite_keys t),
 'phase',case when exists(select from byus_dms_fixture.completion_barriers where id='cdc-complete') then 'cdc-complete' else 'initial' end,
 'deletedAbsent',not exists(select from byus_dms_fixture.text_keys where id='delete😀') and not exists(select from byus_dms_fixture.composite_keys where tenant='한글😀' and id=2),
 'updatedPresent',exists(select from byus_dms_fixture.text_keys where id='한글😀:''keep' and payload='updated😀') and exists(select from byus_dms_fixture.composite_keys where tenant='한글😀' and id=1 and payload='updated😀'),
 'neighbourPreserved',exists(select from byus_dms_fixture.composite_keys where tenant='other' and id=2 and payload='neighbour'),
 'textPrimaryKey',(select count(*)=1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.conrelid='byus_dms_fixture.text_keys'::regclass and c.contype='p' and a.atttypid='text'::regtype),
 'compositePrimaryKey',exists(select from pg_constraint where conrelid='byus_dms_fixture.composite_keys'::regclass and contype='p' and cardinality(conkey)=2)
);

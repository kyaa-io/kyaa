-- Run only after DMS stops; preserve explicit IDs and restore source identity semantics.
do $$begin
 if current_database()<>'byus_dms_fixture_target' or current_user<>'byus_dms_fixture_target' then raise exception 'Target fixture identity required'; end if;
 if not exists(select from byus_dms_fixture.barriers where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'Committed CDC barrier required'; end if;
end $$;
select setval(pg_get_serial_sequence('byus_dms_fixture.records','id'),(select max(id) from byus_dms_fixture.records),true);
alter table byus_dms_fixture.records alter column id set generated always;

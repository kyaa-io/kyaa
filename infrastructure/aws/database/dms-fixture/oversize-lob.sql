-- Only AFTER both initial and CDC exact comparisons pass. Expect actual DMS task failure.
do $$begin if current_database()<>'byus_dms_fixture_source' or current_user<>'byus_dms_fixture_source' then raise exception 'Source fixture identity required'; end if;end $$;
begin;
update byus_dms_fixture.records set data=decode(repeat('ab',2097152),'hex') where id=1001;
commit;

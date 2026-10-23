do $$begin if current_database()<>'byus_dms_fixture_source' or current_user<>'byus_dms_fixture_source' then raise exception 'Source fixture identity required'; end if;end $$;
begin;
update byus_dms_fixture.text_keys set payload='updated😀' where id='한글😀:''keep';
delete from byus_dms_fixture.text_keys where id='delete😀';
update byus_dms_fixture.composite_keys set payload='updated😀' where tenant='한글😀' and id=1;
delete from byus_dms_fixture.composite_keys where tenant='한글😀' and id=2;
insert into byus_dms_fixture.completion_barriers values('cdc-complete');
commit;

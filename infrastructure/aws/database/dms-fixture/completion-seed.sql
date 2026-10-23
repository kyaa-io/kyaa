do $$begin if current_database()<>'byus_dms_fixture_source' or current_user<>'byus_dms_fixture_source' then raise exception 'Source fixture identity required'; end if;end $$;
begin;
insert into byus_dms_fixture.text_keys values('한글😀:''keep','initial'),('delete😀','delete');
insert into byus_dms_fixture.composite_keys values('한글😀',1,'initial'),('한글😀',2,'delete'),('other',2,'neighbour');
insert into byus_dms_fixture.completion_barriers values('initial');
commit;

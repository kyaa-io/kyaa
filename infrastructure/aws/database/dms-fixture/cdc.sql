do $$begin if current_database()<>'byus_dms_fixture_source' or current_user<>'byus_dms_fixture_source' then raise exception 'Source fixture identity required'; end if;end $$;
begin;
update byus_dms_fixture.records set payload='갱신😀𠮷',document=jsonb_build_object('text','CDC😀𠮷','n',12345678901234567890::numeric),data=decode('0001fff09f9880','hex'),tags=array['CDC','한글😀'],fixed_num=(repeat('8',78)::numeric),unbounded_num=9876543210987654321098765432109876543210.98765432109876543210,mood='반영😀' where id=1001;
insert into byus_dms_fixture.records(owner_id,payload,document,data,tags,fixed_num,unbounded_num,mood) select owner_id,'자동할당😀',document,data,tags,fixed_num,unbounded_num,'종료' from byus_dms_fixture.records where id=1001;
commit;
begin;
update byus_dms_fixture.records set payload='ROLLBACK must never arrive' where id=1001;
insert into byus_dms_fixture.owners values('99999999-9999-4999-8999-999999999999','ROLLBACK');
rollback;
-- The final committed data row is observed at target; pending=0 alone is insufficient.
begin;
insert into byus_dms_fixture.barriers values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cdc-complete','실제 row와 전체 canonical hash 확인');
commit;

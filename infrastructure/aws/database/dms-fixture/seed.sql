do $$begin if current_database()<>'byus_dms_fixture_source' or current_user<>'byus_dms_fixture_source' then raise exception 'Source fixture identity required'; end if;end $$;
begin;
insert into byus_dms_fixture.owners values('11111111-1111-4111-8111-111111111111','소유자😀𠮷');
insert into byus_dms_fixture.records(owner_id,payload,document,data,tags,fixed_num,unbounded_num,mood) values
('11111111-1111-4111-8111-111111111111','초기😀𠮷',jsonb_build_object('text','한글😀𠮷','nested',jsonb_build_array(1,true,null)),decode('00ff1020f09f9880','hex'),array['한글','😀','𠮷'],repeat('9',78)::numeric,1234567890123456789012345678901234567890.12345678901234567890,'준비');
insert into byus_dms_fixture.barriers values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','initial','초기 full-load 비교');
commit;

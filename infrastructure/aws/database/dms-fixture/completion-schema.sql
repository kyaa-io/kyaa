do $$begin if current_database() not in('byus_dms_fixture_source','byus_dms_fixture_target') or current_user<>current_database() then raise exception 'Fixture DB/owner identity required'; end if;end $$;
create table byus_dms_fixture.text_keys(id text primary key,payload text not null);
create table byus_dms_fixture.composite_keys(tenant text not null,id bigint not null,payload text not null,primary key(tenant,id));
create table byus_dms_fixture.completion_barriers(id text primary key);

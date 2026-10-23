-- Run identically in the two separate fixture DBs, as their dedicated owner role.
do $$begin
 if current_database() not in('byus_dms_fixture_source','byus_dms_fixture_target') or current_user<>current_database() then raise exception 'Fixture DB/owner identity required'; end if;
 if current_setting('server_version_num')::integer/10000<>17 then raise exception 'Fixture requires PostgreSQL17'; end if;
end $$;
create schema byus_dms_fixture;
create type byus_dms_fixture.fixture_mood as enum('준비','반영😀','종료');
create table byus_dms_fixture.owners(id uuid primary key,label text not null);
create table byus_dms_fixture.records(
 id bigint generated always as identity(start with 1001) primary key,
 owner_id uuid not null references byus_dms_fixture.owners(id),
 payload text not null,document jsonb not null,data bytea not null,tags text[] not null,
 fixed_num numeric(78,0) not null,unbounded_num numeric not null,
 mood byus_dms_fixture.fixture_mood not null,
 generated_fingerprint text generated always as(md5(payload||':'||owner_id::text)) stored
);
create table byus_dms_fixture.barriers(id uuid primary key,phase text not null,note text not null);
-- DMS control objects are confined to this otherwise empty target fixture DB.
do $$begin if current_database()='byus_dms_fixture_target' then create schema byus_dms_fixture_control; end if;end $$;

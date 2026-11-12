-- Synthetic data only. Run on a disposable/local migrated DB after 20261224051000; everything rolls back.
begin;
do $$
declare p uuid:=gen_random_uuid(); a1 uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); r jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values
  (a1,'did:privy:pd-'||a1,a1||'@example.test'),(a2,'did:privy:pd-'||a2,a2||'@example.test'),(fan,'did:privy:pd-'||fan,fan||'@example.test');
 insert into public.admin_allowlist(id,email,active,role) values (adm,adm||'@example.test',true,'admin');
 insert into public.group_pages(id,kind,name) values (p,'hobby','presence default page');
 -- a new binding turns presence on
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,a1,adm);
 if (select enabled from public.group_artist_presence_settings where app_user_id=a1) is not true then raise exception 'new binding must default on'; end if;
 -- an artist who turned it off stays off when bound again elsewhere
 insert into public.group_artist_presence_settings(app_user_id,enabled) values (a2,false);
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,a2,adm);
 if (select enabled from public.group_artist_presence_settings where app_user_id=a2) is not false then raise exception 'explicit off must be kept'; end if;
 -- the artist can still turn it off
 r:=public.groups_content_dispatch('set-presence-setting',a1,null,null,'{"enabled":false}'::jsonb);
 if (select enabled from public.group_artist_presence_settings where app_user_id=a1) is not false then raise exception 'artist must be able to turn off'; end if;
 r:=public.groups_content_dispatch('presence-setting',a1,null,null,'{}'::jsonb);
 if (r->>'enabled')::boolean is not false or (r->>'canConfigure')::boolean is not true then raise exception 'setting read wrong: %',r; end if;
 -- fans get no row
 if exists(select 1 from public.group_artist_presence_settings where app_user_id=fan) then raise exception 'fan must not get a row'; end if;
 -- column default
 if (select column_default from information_schema.columns where table_schema='public' and table_name='group_artist_presence_settings' and column_name='enabled')<>'true' then raise exception 'column default must be true'; end if;
end $$;
-- every existing binding is on unless the artist changed it after the migration
do $$ begin
 if exists(select 1 from public.group_artist_bindings b left join public.group_artist_presence_settings s on s.app_user_id=b.app_user_id where b.app_user_id is not null and s.app_user_id is null) then raise exception 'bound artist without a setting row'; end if;
 if has_table_privilege('anon','public.group_artist_presence_default_backup','select') or has_table_privilege('authenticated','public.group_artist_presence_default_backup','select') then raise exception 'backup must be private'; end if;
end $$;
rollback;

-- READ ONLY: no table rows, object paths, tokens, statements or credentials.
select jsonb_build_object(
 'sessionUser',session_user,'currentUser',current_user,
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),'hasTrigger',has_table_privilege(current_user,c.oid,'TRIGGER'),'ownerUsage',pg_has_role(current_user,c.relowner,'USAGE'),'ownerSetRole',pg_has_role(current_user,c.relowner,'SET'),'superuser',(select rolsuper from pg_roles where rolname=current_user)) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in('buckets','objects') and c.relkind='r'),
 'logicalSubscribers',(select coalesce(jsonb_agg(jsonb_build_object('name',subname,'enabled',subenabled)),'[]') from pg_subscription where subdbid=(select oid from pg_database where datname=current_database())),
 'writerRoleCandidates',(select jsonb_agg(jsonb_build_object('role',r.rolname,'superuser',r.rolsuper,'canSetReplica',has_parameter_privilege(r.oid,'session_replication_role','SET'))) from pg_roles r where r.rolname in('supabase_storage_admin','authenticator','service_role','postgres')),
 'storageBackends',(select coalesce(jsonb_agg(jsonb_build_object('role',usename,'application',application_name,'state',state,'count',n)),'[]') from (select usename,application_name,state,count(*) n from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and (usename like '%storage%' or application_name ilike '%storage%') group by usename,application_name,state) q)
);

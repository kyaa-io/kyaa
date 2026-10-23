-- Real metadata projection + read-only enforcement; no object rows/paths are returned.
with bucket_rows as(select id,jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) value from storage.buckets),
object_rows as(select id,jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'metadata',metadata,'user_metadata',to_jsonb(s)->'user_metadata') value from storage.objects s)
select jsonb_build_object(
 'projection',jsonb_build_object(
  'buckets',(select jsonb_build_object('rows',count(*)::text,'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(value order by id collate "C"),'[]')::text,'UTF8')),'hex')) from bucket_rows),
  'objects',(select jsonb_build_object('rows',count(*)::text,'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(value order by id::text collate "C"),'[]')::text,'UTF8')),'hex')) from object_rows)),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'guard',(select jsonb_build_object('enabled',tg.tgenabled,'type',tg.tgtype,'function',tg.tgfoid::regprocedure::text,'functionHash',md5(pg_get_functiondef(tg.tgfoid)),'rejectsAllWrites',(select p.prosecdef and p.prosrc=$guardbody$
begin
  raise exception 'Legacy storage metadata is sealed' using errcode='55000';
end $guardbody$ from pg_proc p where p.oid=tg.tgfoid)) from pg_trigger tg where tg.tgrelid=c.oid and tg.tgname='byus_metadata_read_only' and not tg.tgisinternal)) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in('buckets','objects') and c.relkind='r'),
 'unexpectedRelations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relkind in('r','p','v','m','f','S') and c.relname not in('buckets','objects')),
 'unexpectedRoutines',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='storage' and p.oid is distinct from to_regprocedure('storage.byus_reject_metadata_mutation()')),
 'writerPrivileges',(select jsonb_agg(jsonb_build_object('role',r.rolname,'unsafe',has_schema_privilege(r.oid,'storage','CREATE') or exists(select from pg_proc gp where gp.oid=to_regprocedure('storage.byus_reject_metadata_mutation()') and pg_has_role(r.oid,gp.proowner,'MEMBER')) or exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in('buckets','objects') and (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') or pg_has_role(r.oid,c.relowner,'MEMBER')))) order by r.rolname) from pg_roles r where r.rolname in(select jsonb_array_elements_text(:'application_roles_json'::jsonb)))
);

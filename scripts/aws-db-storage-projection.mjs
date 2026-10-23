import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

const sqlFile = name => readFile(new URL(`../infrastructure/aws/database/${name}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const jsonLiteral = text => `'${text.replaceAll("'", "''")}'::jsonb`;
const literal = value => jsonLiteral(JSON.stringify(value));
const shape = ({ projection: _projection, ...rest }) => rest;
const fail = () => { throw new Error('Legacy storage projection refresh failed'); };

// The caller proves database identities, closed import logins and the live source fence.
// Never expose the source snapshot or the database exception (including SQL/stderr).
export async function refreshLegacyStorageProjection(source, target, {
  expectedShapeHash, sourceFenceVerified, importsClosed,
} = {}) {
  if (sourceFenceVerified !== true || importsClosed !== true || !/^[a-f0-9]{64}$/.test(expectedShapeHash ?? '')) fail();
  try {
    const [exportSql, inventorySql] = await Promise.all([sqlFile('storage-export.sql'), sqlFile('storage-inventory.sql')]);
    const query = text => text.trim().replace(/;\s*$/, '');
    const initial = await target.run(inventorySql);
    const initialShape = shape(initial);
    if (hash(initialShape) !== expectedShapeHash) fail();
    const snapshot = await source.run(`select jsonb_build_object('snapshot',s.value::text,'projection',jsonb_build_object(
      'buckets',jsonb_build_object('rows',jsonb_array_length(s.value->'buckets')::text,'sha256',encode(sha256(convert_to((s.value->'buckets')::text,'UTF8')),'hex')),
      'objects',jsonb_build_object('rows',jsonb_array_length(s.value->'objects')::text,'sha256',encode(sha256(convert_to((s.value->'objects')::text,'UTF8')),'hex'))))
      from (${query(exportSql)}) as s(value);`);
    const inventory = query(inventorySql).replaceAll(":'application_roles_json'", "current_setting('byus_projection.application_roles')");
    const delimiter = `$byus_projection_${randomUUID().replaceAll('-', '')}$`;
    // Exactly one target run: psql opens a new connection on every invocation.
    return await target.run(`begin;
set local log_statement='none';
set local log_min_error_statement='panic';
set local standard_conforming_strings=on;
select set_config('byus_projection.application_roles', :'application_roles_json', true) as roles_configured \u005cgset
lock table storage.buckets, storage.objects in access exclusive mode;
do ${delimiter}
declare observed jsonb; payload jsonb := ${jsonLiteral(snapshot.snapshot)};
begin
  select (${inventory}) into observed;
  if observed-'projection' is distinct from ${literal(initialShape)} then raise exception 'Projection shape changed'; end if;
  if (select count(*) from pg_trigger where tgrelid in ('storage.buckets'::regclass,'storage.objects'::regclass)
      and tgname='byus_metadata_read_only' and not tgisinternal and tgenabled='A') <> 2 then raise exception 'Projection seals invalid'; end if;
  if exists(select from pg_constraint where contype='f' and confrelid='storage.objects'::regclass) then raise exception 'Projection objects have incoming references'; end if;
  alter table storage.buckets disable trigger byus_metadata_read_only;
  alter table storage.objects disable trigger byus_metadata_read_only;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    select id,name,public,file_size_limit,allowed_mime_types from jsonb_to_recordset(payload->'buckets')
      as x(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])
    on conflict(id) do update set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  delete from storage.objects;
  insert into storage.objects(id,bucket_id,name,metadata,user_metadata)
    select id,bucket_id,name,metadata,user_metadata from jsonb_to_recordset(payload->'objects')
      as x(id uuid,bucket_id text,name text,metadata jsonb,user_metadata jsonb);
  delete from storage.buckets b where not exists(select from jsonb_array_elements(payload->'buckets') x where x->>'id'=b.id);
  if exists(select from public.s3_storage_objects o where not exists(select from storage.buckets b where b.id=o.bucket_id))
    or exists(select from public.s3_storage_delete_outbox d where not exists(select from public.s3_storage_objects o where (o.bucket_id,o.name)=(d.bucket_id,d.name)))
    or exists(select from public.s3_storage_migration_objects m where not exists(select from public.s3_storage_objects o where (o.bucket_id,o.name)=(m.bucket_id,m.name))) then
    raise exception 'S3 metadata has orphaned references';
  end if;
  alter table storage.buckets enable always trigger byus_metadata_read_only;
  alter table storage.objects enable always trigger byus_metadata_read_only;
  select (${inventory}) into observed;
  if observed-'projection' is distinct from ${literal(initialShape)} or observed->'projection' is distinct from ${literal(snapshot.projection)} then
    raise exception 'Projection verification failed';
  end if;
  perform set_config('byus_projection.receipt',(observed->'projection')::text,true);
end
${delimiter};
select current_setting('byus_projection.receipt')::jsonb;
commit;`);
  } catch { fail(); }
}

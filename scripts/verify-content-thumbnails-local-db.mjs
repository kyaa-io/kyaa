// Disposable local PostgreSQL only; no environment files or remote credentials.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), dir = mkdtempSync(join(tmpdir(), 'byus-thumbnails-'));
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
function cmd(name, args, input) { const r = spawnSync(name, args, { input, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); }
function sql(s) { return cmd('psql', [`postgresql://127.0.0.1:${port}/postgres`, '-XAtq', '-v', 'ON_ERROR_STOP=1'], s); }
let started = false;
try {
  cmd('initdb', ['-D', join(dir, 'data'), '--auth=trust', '--no-locale', '--encoding=UTF8']); mkdirSync(join(dir, 'socket'));
  cmd('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${join(dir, 'socket')}`, 'start']); started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create schema storage; create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
    insert into storage.buckets values('fan-content-assets',8388608,array['image/webp']);
    create table public.app_users(id uuid primary key,status text);
    create table public.content_assets(id uuid primary key,app_user_id uuid,storage_path text unique,byte_size bigint,mime_type text,sha256 text,uploaded_at timestamptz,upload_settled_at timestamptz,upload_expires_at timestamptz,deleted_at timestamptz,cleanup_requested_at timestamptz,storage_deleted_at timestamptz,cleanup_retry_at timestamptz,cleanup_generation bigint default 0,post_id uuid,notice_id uuid,expires_at timestamptz);
    create table public.fan_private_uploads(bucket text,object_path text,expires_at timestamptz);
    create table public.mobile_media_assets(storage_path text,thumbnail_path text,purpose text,kind text,state text,cleanup_requested_at timestamptz,storage_deleted_at timestamptz);
  `);
  const s3 = readFileSync(new URL('supabase/migrations/20261130001000_aws_asset_storage.sql', root), 'utf8');
  sql(s3.slice(s3.indexOf('-- Physical'), s3.indexOf('create function public.reserve_s3_mobile_upload')) + s3.slice(s3.indexOf('create function public.queue_s3_storage_delete'), s3.indexOf('-- Existing guarded functions')));
  sql(readFileSync(new URL('supabase/migrations/20261208063000_content_stored_thumbnails.sql', root), 'utf8'));
  const content = readFileSync(new URL('supabase/migrations/20260926012500_fan_web_content.sql', root), 'utf8');
  sql(content.slice(content.indexOf('create function public.claim_content_asset_cleanup'), content.indexOf('-- A storage upload can finish')));
  const path = '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp', variant = path.replace('.webp', '.thumbnail-240-v1.webp');
  sql(`insert into app_users values('22222222-2222-4222-8222-222222222222','active');
    insert into content_assets(id,app_user_id,storage_path,byte_size,mime_type,sha256,uploaded_at,upload_settled_at,upload_expires_at) values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','${path}',10,'image/webp',repeat('a',64),now(),now(),now());`);
  const begin = () => sql(`select begin_content_thumbnail_upload('${path}')`);
  const settle = (g, ok = true) => sql(`select settle_content_thumbnail_upload('${path}',${g},${ok})`);
  const g1 = begin(); assert.equal(g1, '1'); assert.equal(begin(), '-1');
  sql(`select reserve_s3_storage_object('fan-content-assets','${variant}','image/webp',2,repeat('b',64));`);
  for (const [badPath,size,hash] of [[path,11,'a'],[path,10,'b'],[variant+'x',2,'b']]) {
    assert.throws(() => sql(`select reserve_s3_storage_object('fan-content-assets','${badPath}','image/webp',${size},repeat('${hash}',64));`), /S3_UPLOAD_NOT_RESERVED/);
  }
  sql(`update content_assets set upload_expires_at=now()-interval '1 second'`);
  const g2 = begin(); assert.equal(g2, '2'); assert.equal(settle(g1), 'f');
  assert.equal(sql('select thumbnail_generation=2 and upload_settled_at is null from content_assets'), 't');
  // A stale worker settling after deletion request must preserve the newer writer horizon.
  sql('update content_assets set cleanup_requested_at=now()');
  assert.equal(settle(g1), 'f');
  assert.equal(sql('select upload_settled_at is null from content_assets'), 't');
  assert.equal(JSON.parse(sql('select claim_content_asset_cleanup(10)')).items.length, 0);
  assert.equal(sql("select retry_at>= (select upload_expires_at from content_assets) from s3_storage_delete_outbox"), 't');
  assert.equal(settle(g2,false), 'f');
  assert.equal(sql('select upload_settled_at is null from content_assets'), 't');
  assert.equal(JSON.parse(sql('select claim_content_asset_cleanup(10)')).items.length, 0);
  sql('update content_assets set cleanup_requested_at=null');
  // Drain this deletion intent to resume the independent live-conversion failure scenario.
  sql('delete from s3_storage_delete_outbox; update s3_storage_objects set state=\'uploading\'');
  assert.equal(settle(g2,false), 'f'); assert.equal(sql('select deleted_at is null and cleanup_requested_at is null and upload_settled_at is null from content_assets'), 't');
  sql("update content_assets set upload_expires_at=now()-interval '1 second'");
  // A crashed conversion's delayed S3 outbox may drain while the original remains live.
  sql(`insert into s3_storage_delete_outbox(bucket_id,name,retry_at) values('fan-content-assets','${variant}',now()-interval '1 second');`);
  const failedVariant = JSON.parse(sql('select claim_s3_storage_deletes(10)'))[0];
  sql(`select finish_s3_storage_delete('fan-content-assets','${variant}',${failedVariant.generation},true);`);
  const g3 = begin();
  sql(`update content_assets set upload_expires_at=now()+interval '1 second';
    select reserve_s3_storage_object('fan-content-assets','${variant}','image/webp',2,repeat('b',64));`);
  assert.equal(sql("select upload_expires_at>now()+interval '4 minutes' from content_assets"), 't');
  assert.equal(sql(`select state from s3_storage_objects where name='${variant}'`), 'uploading');
  // Lease expires, cleanup completes, then an old worker's late PUT settles.
  sql(`update content_assets set cleanup_requested_at=now()`);
  assert.equal(JSON.parse(sql('select claim_content_asset_cleanup(10)')).items.length, 0);
  sql(`update content_assets set upload_expires_at=now()-interval '1 second'`);
  const claim = JSON.parse(sql('select claim_content_asset_cleanup(10)')).items[0];
  assert.ok(claim);
  sql(`select finish_content_asset_cleanup('${claim.id}',${claim.generation},true);
    select queue_s3_storage_delete('fan-content-assets','${variant}');
    select finish_s3_storage_delete('fan-content-assets','${variant}',(select generation from s3_storage_delete_outbox where name='${variant}'),true);`);
  assert.equal(settle(g3), 'f');
  assert.equal(sql('select storage_deleted_at is null and cleanup_retry_at<=now() from content_assets'), 't');
  assert.equal(sql(`select count(*) from s3_storage_delete_outbox where name='${variant}' and lease_until is null and retry_at<=now()`), '1');
  // Account disable also reopens durable cleanup even before the deletion request arrives.
  sql(`update content_assets set cleanup_requested_at=null,storage_deleted_at=now(); update app_users set status='disabled';`);
  assert.equal(settle(g3), 'f'); assert.equal(sql('select storage_deleted_at is null and cleanup_requested_at is not null from content_assets'), 't');
  assert.equal(sql("select has_function_privilege('anon','public.begin_content_thumbnail_upload(text)','execute') or has_function_privilege('authenticated','public.settle_content_thumbnail_upload(text,bigint,boolean)','execute')"), 'f');
  sql(`update content_assets set post_id=null,notice_id=null,deleted_at=null,cleanup_requested_at=null,storage_deleted_at=null,upload_settled_at=null,upload_expires_at=now()+interval '5 minutes';
    select abandon_content_asset_upload('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');`);
  assert.equal(JSON.parse(sql('select claim_content_asset_cleanup(10)')).items.length, 0);
  sql("update content_assets set upload_expires_at=now()-interval '1 second'");
  assert.equal(JSON.parse(sql('select claim_content_asset_cleanup(10)')).items.length, 1);
  console.log('PASS: migration, lease exclusion/expiry, stale live lease, failed live conversion, late PUT after cleanup, disabled owner, exact original path/size/hash, variant tombstone recovery, reservation write fence without settle, variant path, service-role grants');
} finally { if (started) cmd('pg_ctl', ['-D', join(dir,'data'), '-m', 'fast', 'stop']); console.log(`Local evidence retained: ${dir}`); }

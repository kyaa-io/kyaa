import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { sha } from './aws-storage-rewrite-urls.mjs';
import { NOTICE_SCOPE, EXPECTED, rewriteNoticeBody, makeNoticePlan, rewriteNoticeAssets } from './aws-storage-rewrite-notice-assets.mjs';

const SOURCE='https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/';
const TARGET='https://kyaa.io/public-assets/cms-assets/';
function fixture() {
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const celebrity='00000000-0000-4000-8000-000000000003';
 const scope={[sha(ids[0])]:[2,3,4,5],[sha(ids[1])]:[2,3,4,5,6,7,8,9]};
 const mappings=new Map(Array.from({length:12},(_,i)=>[SOURCE+`images/${i}.webp`,{old:SOURCE+`images/${i}.webp`,new:TARGET+`images/${i}.webp`,path:`images/${i}.webp`}]));
 const parents=ids.map(id=>({row:{id,celebrity_id:celebrity,publication_status:'published',archived_at:null,visibility:'public',revision:7},celebrity:{id:celebrity,status:'published',archived_at:null}}));
 const rows=ids.flatMap((notice_id,n)=>['ko','en'].map(locale=>({notice_id,locale,title:locale==='ko'?'원문 제목':'Original title',created_at:'2026-01-01',updated_at:'2026-01-01',body_json:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'원문 그대로 & "English"',marks:[{type:'link',attrs:{href:'https://example.com/?keep=1'}}]}]},{type:'paragraph',content:[]},...Array.from({length:n?8:4},(_,i)=>({type:'image',attrs:{src:SOURCE+`images/${n?i+4:i}.webp`,alt:`원문 ${i}`,width:440,custom:{keep:true}}}))],customDocumentField:['그대로',123]}})));
 const expected={cells:24,unique:12,hash:sha(JSON.stringify([...mappings.keys()].sort()))};
 return {scope,mappings,expected,snapshot:{parents,rows},ids};
}
test('production scope is limited to the audited two notice hashes and 24 image positions',()=>{
 assert.equal(Object.keys(NOTICE_SCOPE).length,2);assert.deepEqual(Object.values(NOTICE_SCOPE).map(x=>x.length),[4,8]);assert.equal(EXPECTED.cells,24);assert.equal(EXPECTED.unique,12);assert.equal(EXPECTED.hash,'a2d7d5cf8e5de8102a14107f1c6f182f3be3aedb5802eec4bbc151606aa00c89');
});
test('only exact image attrs.src values change, preserving text, translation, alt and arbitrary JSON fields',()=>{
 const {snapshot,mappings,scope}=fixture();const row=snapshot.rows[0],before=structuredClone(row.body_json);
 const result=rewriteNoticeBody(row.body_json,row.notice_id,mappings,scope);assert.equal(result.changes.length,4);assert.deepEqual(row.body_json,before);
 const restored=structuredClone(result.body);for(const change of result.changes)restored.content[change.index].attrs.src=change.old;
 assert.deepEqual(restored,before);assert.equal(result.body.content[2].attrs.src,TARGET+'images/0.webp');
});
test('foreign, private, signed, missing mappings and unplanned nested image nodes never get rewritten',()=>{
 const {snapshot,mappings,scope}=fixture();const row=snapshot.rows[0];
 for(const src of ['https://evil.test/a.webp',SOURCE+'missing.webp',SOURCE+'images/0.webp?token=secret',SOURCE.replace('cms-assets','fan-avatars')+'private.webp']) {
  const body=structuredClone(row.body_json);body.content[2].attrs.src=src;assert.throws(()=>rewriteNoticeBody(body,row.notice_id,mappings,scope));
 }
 const body=structuredClone(row.body_json);body.content[0].content.push({type:'image',attrs:{src:SOURCE+'images/0.webp'}});assert.throws(()=>rewriteNoticeBody(body,row.notice_id,mappings,scope),/UNPLANNED/);
});
test('plan requires exact public parents, complete ko/en, notice identities and URL-set fingerprint',()=>{
 const {snapshot,mappings,expected,scope}=fixture();const plan=makeNoticePlan(snapshot,mappings,expected,scope);assert.equal(plan.rows.length,4);assert.equal(plan.summary.cells,24);assert.equal(plan.summary.unique,12);
 assert.throws(()=>makeNoticePlan(snapshot,mappings));
 for(const mutate of [x=>x.rows.pop(),x=>x.rows[0].locale='ja',x=>x.parents[0].row.visibility='members',x=>x.parents[0].row.publication_status='draft',x=>x.parents[0].row.archived_at='2026-01-01',x=>x.parents[0].celebrity.status='draft',x=>x.parents[0].row.id='unapproved']) {
  const changed=structuredClone(snapshot);mutate(changed);assert.throws(()=>makeNoticePlan(changed,mappings,expected,scope));
 }
 assert.throws(()=>makeNoticePlan(snapshot,mappings,{...expected,hash:'wrong'},scope));
});

test('local PostgreSQL: exact-body CAS, private backup, publication checks, child-only apply/rollback and AFTER-trigger rollback', {skip:!process.env.NOTICE_REWRITE_TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.NOTICE_REWRITE_TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/kyaa_notice_assets_fixture');assert(Number(url.port)>=49152);
 const require=createRequire(process.env.STORAGE_REWRITE_TEST_PG_PACKAGE);const {Client}=require('pg');const db=new Client({connectionString:url.href});await db.connect();
 const dir=await mkdtemp(join(tmpdir(),'notice-rewrite-'));const work=join(dir,'work');await mkdir(work);
 try {
  const {snapshot,mappings,scope,expected,ids}=fixture();
  await db.query(`create type public.content_locale as enum('ko','en');
   create table public.celebrities(id uuid primary key,status text,archived_at timestamptz);
   create table public.celebrity_notices(id uuid primary key,celebrity_id uuid,publication_status text,archived_at timestamptz,visibility text,revision integer);
   create table public.celebrity_notice_localizations(notice_id uuid,locale public.content_locale,title text,body_json jsonb,created_at text,updated_at text,primary key(notice_id,locale));
   create table public.s3_storage_objects(bucket_id text,name text,state text);
   create table public.s3_storage_delete_outbox(bucket_id text,name text);`);
  const migration=await readFile('supabase/migrations/20260726010000_celebrity_notice_cms.sql','utf8');
  await db.query(migration.match(/create function public\.assert_notice_publishable\(p_notice_id uuid\)[\s\S]*?end \$\$;/)[0]);
  await db.query(`create function public.fixture_forbid_parent_update() returns trigger language plpgsql as $$begin raise exception 'PARENT_UPDATE_FORBIDDEN';end $$;
   create trigger fixture_parent_notification after update on public.celebrity_notices for each row execute function public.fixture_forbid_parent_update();
   create function public.fixture_touch() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp()::text;return new;end $$;
   create trigger celebrity_notice_localizations_set_updated_at before update on public.celebrity_notice_localizations for each row execute function public.fixture_touch();`);
  await db.query('insert into public.celebrities values($1,$2,null)',[snapshot.parents[0].celebrity.id,'published']);
  for(const {row} of snapshot.parents)await db.query('insert into public.celebrity_notices values($1,$2,$3,null,$4,$5)',[row.id,row.celebrity_id,row.publication_status,row.visibility,row.revision]);
  for(const row of snapshot.rows)await db.query('insert into public.celebrity_notice_localizations values($1,$2,$3,$4::jsonb,$5,$6)',[row.notice_id,row.locale,row.title,JSON.stringify(row.body_json),row.created_at,row.updated_at]);
  for(const mapping of mappings.values())await db.query("insert into public.s3_storage_objects values('cms-assets',$1,'ready')",[mapping.path]);
  const read=async()=>({parents:(await db.query('select to_jsonb(n) as row,to_jsonb(c) as celebrity from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id order by n.id')).rows,rows:(await db.query('select to_jsonb(t) as row from public.celebrity_notice_localizations t order by notice_id,locale::text')).rows.map(item=>item.row)});
  const plan=makeNoticePlan(await read(),mappings,expected,scope),backupPath=join(work,'apply.json');
  const triggers=(await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows;
  const result=await rewriteNoticeAssets({db,plan,mappings,expected,scope,backupPath});assert.equal(result.cells,24);assert.equal((await stat(backupPath)).mode&0o777,0o600);
  assert.equal((await read()).rows[0].body_json.content[2].attrs.src.startsWith(TARGET),true);assert.deepEqual((await read()).parents,plan.parents);
  await rewriteNoticeAssets({db,plan:JSON.parse(await readFile(backupPath)),mappings,expected,scope,backupPath:join(work,'rollback.json'),rollback:true});
  assert.deepEqual((await read()).rows.map(row=>({...row,updated_at:'ignored'})),plan.rows.map(item=>({...item.row,updated_at:'ignored'})));
  await db.query("update public.celebrity_notice_localizations set title='new user edit' where notice_id=$1 and locale='ko'",[ids[0]]);
  await assert.rejects(rewriteNoticeAssets({db,plan,mappings,expected,scope,backupPath:join(work,'cas.json')}),/CAS/);
  await db.query('update public.celebrity_notice_localizations set title=$1 where notice_id=$2 and locale=$3',[plan.rows.find(item=>item.row.notice_id===ids[0]&&item.row.locale==='ko').row.title,ids[0],'ko']);
  await db.query(`create function public.fixture_after() returns trigger language plpgsql as $$begin
    if new.body_json#>>'{content,2,attrs,src}'='${TARGET}images/0.webp' then
      update public.celebrity_notice_localizations set body_json=jsonb_set(body_json,'{content,2,attrs,src}','"https://kyaa.io/unexpected.webp"'::jsonb) where notice_id=new.notice_id and locale=new.locale;
    end if;return new;end $$;
   create constraint trigger fixture_after after update on public.celebrity_notice_localizations deferrable initially deferred for each row execute function public.fixture_after();`);
  const before=await read();
  await assert.rejects(rewriteNoticeAssets({db,plan,mappings,expected,scope,backupPath:join(work,'after.json')}),/NOTICE_FINAL_ROW_MISMATCH/);
  assert.deepEqual(await read(),before);
  await db.query('drop trigger fixture_after on public.celebrity_notice_localizations');
  assert.deepEqual((await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows,triggers);
 }finally{await db.end();await rm(dir,{recursive:true,force:true});}
});

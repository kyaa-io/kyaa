import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCOPE, GUARDS, sha, validateInventory, makePlan, validateRows, updateStatement, secureArtifact, rewrite, validateConnection } from './aws-storage-rewrite-urls.mjs';
const source='https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/';
const target='https://kyaa.io/public-assets/cms-assets/';
function inventory() {
 const objects=Array.from({length:79},(_,i)=>({id:`object-${i}`,bucket_id:'cms-assets',name:`images/${i}.webp`,metadata:{size:3}}));
 return {environment:'prod',verified:true,sourceProjectRef:'gmrykvmtmuaeswpajteq',objects,rewriteManifest:objects.map(o=>({old:source+o.name,new:target+o.name})),blobObjects:objects.map(o=>({sourceObjectIdSha256:sha(o.id),sourceSha256:'a'.repeat(64),targetSha256:'a'.repeat(64),sourceBytes:3,targetBytes:3}))};
}
function fixture() {
 const mappings=validateInventory(inventory());
 const preview={id:'preview',square_video_url:source+'images/0.webp',square_poster_url:source+'images/1.webp',landscape_video_url:null,landscape_poster_url:null,updated_at:'old',schedule_revision:4};
 const option={id:'option',question_id:'question',media_url:source+'images/1.webp',semantic_value:'keep',updated_at:'old'};
 const question={id:'question',survey_id:'survey',media_url:source+'images/2.webp',published:true,updated_at:'old'};
 const rows=[{table:'live_event_previews',row:preview},{table:'live_survey_options',row:option},{table:'live_survey_questions',row:question}];
 const expected={cells:4,unique:3,hash:sha(JSON.stringify([0,1,2].map(i=>source+`images/${i}.webp`)))};
 return {mappings,rows,expected,plan:makePlan(rows,mappings,expected)};
}
async function temp() {const dir=await mkdtemp(join(tmpdir(),'cms-rewrite-'));const work=join(dir,'work');await mkdir(work);return{dir,work};}
function database(rows,{beforeUpdate,failUpdate=false,changeSemantic=false}={}) {
 let current=structuredClone(rows),triggers=[...Object.entries(GUARDS).map(([table,name],i)=>({schema:'public',table,name,enabled:i?'A':'O',definition:`guard ${table}`})),{schema:'public',table:'live_survey_options',name:'other_guard',enabled:'O',definition:'keep'}];
 let saved;const queries=[],updates=[];
 return {queries,updates,get rows(){return current;},get triggers(){return triggers;},query:async(text,values=[])=>{
  queries.push(text);
  if(text==='begin'){saved={rows:structuredClone(current),triggers:structuredClone(triggers)};return{rows:[]};}
  if(text==='rollback'){current=saved.rows;triggers=saved.triggers;return{rows:[]};}
  if(text==='show session_replication_role')return{rows:[{session_replication_role:'origin'}]};
  if(text.includes('from pg_trigger'))return{rows:structuredClone(triggers)};
  if(text.startsWith('alter table')) {
   const [,table,command,name]=text.match(/alter table public\.(\w+) (.*?) "([^"]+)"/);
   triggers.find(t=>t.table===table&&t.name===name).enabled={'disable trigger':'D','enable trigger':'O','enable always trigger':'A','enable replica trigger':'R'}[command];return{rows:[]};
  }
  if(text.startsWith('select o.name'))return{rows:values[0].map(name=>({name,state:'ready',delete_queued:false}))};
  if(text.startsWith('select distinct survey_id'))return{rows:[{id:'survey'}]};
  if(text.startsWith('select md5'))return{rows:[{hash:'unchanged'}]};
  if(text.startsWith('select count'))return{rows:[{count:0}]};
  if(text.startsWith('select to_jsonb')) {
   const table=text.match(/from public\.(\w+)/)[1];
   return{rows:current.filter(item=>item.table===table&&(text.includes('for update')?String(item.row.id)===values[0]:SCOPE[table].some(column=>typeof item.row[column]==='string'&&item.row[column].startsWith(source)))).map(item=>({row:structuredClone(item.row)}))};
  }
  if(text.startsWith('update ')) {
   await beforeUpdate?.();if(failUpdate)throw Error('fixture update failure');
   const table=text.match(/update public\.(\w+)/)[1],id=values.at(-1);
   const item=current.find(item=>item.table===table&&String(item.row.id)===id);
   const columns=[...text.slice(0,text.indexOf(' where ')).matchAll(/"(\w+)"=\$(\d+)/g)];
   for(const [,column,index] of columns){if(item.row[column]!==values[Number(index)])return{rowCount:0,rows:[]};item.row[column]=values[Number(index)-1];}
   item.row.updated_at='normal-trigger-update';if(changeSemantic)item.row.schedule_revision=999;
   updates.push({table,id});return{rowCount:1,rows:[{row:structuredClone(item.row)}]};
  }
  return{rows:[]};
 }};
}
test('inventory accepts only exact verified public CMS mappings and matching blob bytes',()=>{
 assert.equal(validateInventory(inventory()).size,79);
 for(const mutate of [x=>x.verified=false,x=>x.environment='staging',x=>x.rewriteManifest[0].old+='?token=secret',x=>x.rewriteManifest[0].old=source.replace('cms-assets','fan-avatars')+'x',x=>x.rewriteManifest[0].new=x.rewriteManifest[1].new,x=>x.rewriteManifest[0].new='https://evil.test/x',x=>x.blobObjects[0].targetSha256='b'.repeat(64),x=>x.blobObjects[0].targetBytes=4]) {
  const value=inventory();mutate(value);assert.throws(()=>validateInventory(value));
 }
});
test('scope is exactly seven base tables and ten columns, with grouped preview values and fixed counts',()=>{
 assert.equal(Object.keys(SCOPE).length,7);assert.equal(Object.values(SCOPE).flat().length,10);
 const {plan,mappings,expected}=fixture();assert.equal(plan.rows.length,3);assert.equal(plan.summary.cells,4);assert.equal(Object.keys(plan.rows.find(x=>x.table==='live_event_previews').changes).length,2);
 assert.throws(()=>validateRows(plan.rows,mappings));
 assert.throws(()=>validateRows([{...plan.rows[0],table:'published_celebrities'}],mappings,expected));
 assert.throws(()=>validateRows([...plan.rows,plan.rows[0]],mappings,expected));
 const drift=structuredClone(plan.rows);drift[0].changes.schedule_revision={old:'x',new:'y'};assert.throws(()=>validateRows(drift,mappings,expected));
 const unmapped=structuredClone(plan.rows);unmapped[0].changes[Object.keys(unmapped[0].changes)[0]].old=source+'missing.webp';assert.throws(()=>validateRows(unmapped,mappings,expected));
});
test('CAS preserves other columns, allows normal updated_at, and groups preview columns once',()=>{
 const {plan}=fixture();const item=plan.rows.find(x=>x.table==='live_event_previews');
 const statement=updateStatement(item,{...item.row,updated_at:'new'});assert.equal((statement.text.match(/update /g)??[]).length,1);assert.match(statement.text,/is not distinct from/);assert.equal(statement.values.length,5);
 assert.throws(()=>updateStatement(item,{...item.row,schedule_revision:5}),/DRIFT/);
 assert.throws(()=>updateStatement(item,{...item.row,square_video_url:'changed'}),/CAS/);
 assert.throws(()=>updateStatement({...item,table:'unsafe;delete'},item.row));
});
test('backup publication is 0600, exclusive, flushed before writes, and preserves existing files',async()=>{
 const {dir,work}=await temp();try {
  const path=join(work,'backup.json');await secureArtifact(path,{private:'payload'});assert.equal((await stat(path)).mode&0o777,0o600);
  await assert.rejects(secureArtifact(path,{overwrite:true}));assert.deepEqual(JSON.parse(await readFile(path)),{private:'payload'});
  await assert.rejects(secureArtifact(join(dir,'not-work.json'),{}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('apply and rollback change four cells in three writes, preserve content, and restore only the two guards',async()=>{
 const {dir,work}=await temp();try {
  const {rows,mappings,expected,plan}=fixture();const backupPath=join(work,'apply.json');
  const db=database(rows,{beforeUpdate:async()=>assert.equal((await stat(backupPath)).mode&0o777,0o600)});
  const triggers=structuredClone(db.triggers);const result=await rewrite({db,plan,mappings,expected,backupPath});
  assert.equal(result.cells,4);assert.equal(db.updates.length,3);assert.deepEqual(db.triggers,triggers);
  assert.equal(db.rows.find(x=>x.table==='live_survey_options').row.semantic_value,'keep');
  assert(!db.queries.some(sql=>sql.includes('trigger all')||sql.includes('session_replication_role=')));
  const disabled=db.queries.filter(sql=>sql.includes('disable trigger'));assert.equal(disabled.length,2);
  const saved=JSON.parse(await readFile(backupPath));
  const retry=await rewrite({db,plan,mappings,expected,backupPath});assert.equal(retry.alreadyApplied,true);assert.equal(db.updates.length,3);
  await rewrite({db,plan:saved,mappings,expected,backupPath:join(work,'rollback.json'),rollback:true});
  assert.deepEqual(db.rows.map(x=>({...x,row:{...x.row,updated_at:'old'}})),rows);assert.deepEqual(db.triggers,triggers);
  await rewrite({db,plan,mappings,expected,backupPath:join(work,'reapply.json')});assert.equal(db.updates.length,9);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('no-op requires the matching apply backup; newer edits cannot be rolled back',async()=>{
 const {dir,work}=await temp();try {
  const {rows,mappings,expected,plan}=fixture();const backupPath=join(work,'apply.json');const db=database(rows);
  await rewrite({db,plan,mappings,expected,backupPath});
  await assert.rejects(rewrite({db,plan,mappings,expected,backupPath:join(work,'missing.json')}));
  db.rows[0].row.square_video_url='user-newer-url';
  await assert.rejects(rewrite({db,plan,mappings,expected,backupPath:join(work,'rollback.json'),rollback:true}),/CAS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CAS conflicts, trigger-time failures, and unexpected content changes roll back all writes and guard states',async()=>{
 for(const scenario of ['cas','failure','content']) {
  const {dir,work}=await temp();try {
   const {rows,mappings,expected,plan}=fixture();if(scenario==='cas')rows[0].row.square_video_url='newer';
   const db=database(rows,{failUpdate:scenario==='failure',changeSemantic:scenario==='content'});const before=structuredClone(db.rows),triggers=structuredClone(db.triggers);
   await assert.rejects(rewrite({db,plan,mappings,expected,backupPath:join(work,'backup.json')}));assert.deepEqual(db.rows,before);assert.deepEqual(db.triggers,triggers);assert.equal(db.queries.at(-1),'rollback');
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});
test('connection cannot point at a different host, database, account secret or insecure TLS',()=>{
 const c={host:'byus-prod-platform-database-40n9gar79vuq.chaamoiiyd3w.ap-northeast-2.rds.amazonaws.com',database:'byus',user:'byus_admin',sslmode:'verify-full',sslrootcert:'/tmp/ca.pem',secretArn:'arn:aws:secretsmanager:ap-northeast-2:996702758024:secret:rds!db-bff1dd89-63c4-4f14-8e15-b02b0b7f56d9-ZKMkGu'};
 validateConnection(c);for(const key of ['host','database','user','sslmode','secretArn'])assert.throws(()=>validateConnection({...c,[key]:'other'}));
});

test('local PostgreSQL fixture uses actual published-snapshot and semantic guards for apply, failure rollback and restore', {skip:!process.env.STORAGE_REWRITE_TEST_DATABASE_URL}, async()=>{
 const url=new URL(process.env.STORAGE_REWRITE_TEST_DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/kyaa_storage_rewrite_fixture');assert(Number(url.port)>=49152);
 const {createRequire}=await import('node:module');
 const require=createRequire(process.env.STORAGE_REWRITE_TEST_PG_PACKAGE);
 const {Client}=require('pg');const db=new Client({connectionString:url.href});await db.connect();
 const {dir,work}=await temp();
 try {
  for(const [table,columns] of Object.entries(SCOPE)) {
   const extra=table==='live_survey_options'?',question_id uuid,semantic_value text':table==='live_survey_questions'?',survey_id uuid':'';
   await db.query(`create table public.${table}(id uuid primary key,${columns.map(column=>column+' text').join(',')},updated_at timestamptz default now(),schedule_revision integer default 4${extra})`);
  }
  await db.query(`create table public.live_surveys(id uuid primary key,lifecycle_status text);
   create table public.live_survey_responses(id uuid primary key,survey_id uuid,status text);
   create table public.live_survey_answers(response_id uuid,question_id uuid,selected_option_ids uuid[]);
   create table public.public_image_role_bindings(owner_id uuid,asset_id uuid,role text);
   create table public.s3_storage_objects(bucket_id text,name text,state text,primary key(bucket_id,name));
   create table public.s3_storage_delete_outbox(bucket_id text,name text);
   create view public.published_celebrities as select * from public.celebrities;`);
  const latestGuard=await readFile('supabase/migrations/20260902124852_phase2_spec_completion.sql','utf8');
  await db.query(latestGuard.match(/create or replace function public\.reject_live_survey_snapshot_mutation\(\)[\s\S]*?end \$\$;/)[0]);
  const semanticGuard=await readFile('supabase/migrations/20260721093500_g5_engagement_analytics.sql','utf8');
  await db.query(semanticGuard.match(/create function public\.protect_common_survey_option_semantic\(\)[\s\S]*?\$\$;/)[0]);
  const q='00000000-0000-4000-8000-000000000001',o='00000000-0000-4000-8000-000000000002',p='00000000-0000-4000-8000-000000000003',s='00000000-0000-4000-8000-000000000004';
  await db.query("insert into public.live_surveys values($1,'published');",[s]);
  await db.query('insert into public.live_survey_responses values($1,$2,$3)',[p,s,'submitted']);
  await db.query('insert into public.live_survey_questions(id,survey_id,media_url) values($1,$2,$3)',[q,s,source+'images/2.webp']);
  await db.query('insert into public.live_survey_options(id,question_id,semantic_value,media_url) values($1,$2,$3,$4)',[o,q,'yes',source+'images/1.webp']);
  await db.query('insert into public.live_event_previews(id,square_video_url,square_poster_url) values($1,$2,$3)',[p,source+'images/0.webp',source+'images/1.webp']);
  for(const [table,name] of Object.entries(GUARDS))await db.query(`create trigger ${name} before insert or update or delete on public.${table} for each row execute function public.reject_live_survey_snapshot_mutation()`);
  await db.query('create trigger live_survey_options_protect_semantic before update on public.live_survey_options for each row execute function public.protect_common_survey_option_semantic()');
  await db.query(`create function public.fixture_touch() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp();return new;end $$;
   create trigger fixture_touch before update on public.live_event_previews for each row execute function public.fixture_touch();`);
  await assert.rejects(db.query('update public.live_survey_options set media_url=media_url where id=$1',[o]),/immutable/);
  for(let i=0;i<3;i++)await db.query("insert into public.s3_storage_objects values('cms-assets',$1,'ready')",[`images/${i}.webp`]);
  const rows=[];for(const table of Object.keys(SCOPE))rows.push(...(await db.query(`select to_jsonb(t) as row from public.${table} t`)).rows.map(({row})=>({table,row})));
  const {mappings,expected}=fixture();const plan=makePlan(rows,mappings,expected);
  const before=(await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows;
  await rewrite({db,plan,mappings,expected,backupPath:join(work,'apply.json')});
  assert.equal((await db.query('select media_url from public.live_survey_options')).rows[0].media_url,target+'images/1.webp');
  assert.deepEqual((await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows,before);
  await assert.rejects(db.query("update public.live_survey_options set semantic_value='no' where id=$1",[o]),/immutable/);
  await rewrite({db,plan,mappings,expected,backupPath:join(work,'rollback.json'),rollback:true});
  assert.equal((await db.query('select media_url from public.live_survey_options')).rows[0].media_url,source+'images/1.webp');
  await db.query(`create function public.fixture_fail() returns trigger language plpgsql as $$ begin if new.media_url like 'https://kyaa.io/%' then raise exception 'fixture failure';end if;return new;end $$;
   create trigger fixture_fail before update on public.live_survey_options for each row execute function public.fixture_fail();`);
  const triggers=(await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows;
  await assert.rejects(rewrite({db,plan,mappings,expected,backupPath:join(work,'failed.json')}),/fixture failure/);
  assert.deepEqual((await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows,triggers);
  assert.equal((await db.query('select square_video_url from public.live_event_previews')).rows[0].square_video_url,source+'images/0.webp');
  await db.query('drop trigger fixture_fail on public.live_survey_options');
  await db.query(`create function public.fixture_after_rewrite() returns trigger language plpgsql as $$ begin
    if new.square_video_url='https://kyaa.io/public-assets/cms-assets/images/0.webp' and new.schedule_revision=4 then
      if tg_argv[0]='url' then update public.live_event_previews set square_video_url='https://kyaa.io/public-assets/cms-assets/other.webp' where id=new.id;
      elsif tg_argv[0]='null' then update public.live_event_previews set square_video_url=null where id=new.id;
      else update public.live_event_previews set schedule_revision=999 where id=new.id;end if;
    end if;return new;end $$;`);
  for(const mutation of ['url','null','content']) {
    await db.query(`create constraint trigger fixture_after_rewrite after update on public.live_event_previews deferrable initially deferred for each row execute function public.fixture_after_rewrite('${mutation}')`);
    const beforeAfterTest=(await db.query('select to_jsonb(t) as row from public.live_event_previews t')).rows;
    const beforeTriggers=(await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows;
    await assert.rejects(rewrite({db,plan,mappings,expected,backupPath:join(work,`after-${mutation}.json`)}),/REWRITE_FINAL_ROW_MISMATCH/);
    assert.deepEqual((await db.query('select to_jsonb(t) as row from public.live_event_previews t')).rows,beforeAfterTest);
    assert.deepEqual((await db.query('select tgname,tgenabled from pg_trigger where not tgisinternal order by tgname')).rows,beforeTriggers);
    assert.equal((await db.query('select media_url from public.live_survey_options')).rows[0].media_url,source+'images/1.webp');
    await db.query('drop trigger fixture_after_rewrite on public.live_event_previews');
  }
 }finally{await db.end();await rm(dir,{recursive:true,force:true});}
});

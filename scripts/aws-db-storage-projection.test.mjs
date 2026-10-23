import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { refreshLegacyStorageProjection } from './aws-db-storage-projection.mjs';

const file = name => readFile(new URL(`../infrastructure/aws/database/${name}`, import.meta.url), 'utf8');
const shapeHash = ({projection: _, ...shape}) => createHash('sha256').update(JSON.stringify(shape)).digest('hex');
const publicError = {message: 'Legacy storage projection refresh failed'};
const ready = {sourceFenceVerified:true, importsClosed:true};
const available = ['psql','initdb','pg_ctl','createdb'].every(cmd => spawnSync('which',[cmd]).status===0);

test('requires both verified barriers and a shape hash without contacting databases', async () => {
  const db = {run(){assert.fail('must not access database');}};
  for (const options of [{}, {...ready}, {...ready, expectedShapeHash:'z'.repeat(64)},
    {...ready,sourceFenceVerified:false,expectedShapeHash:'a'.repeat(64)},
    {...ready,importsClosed:false,expectedShapeHash:'a'.repeat(64)}]) {
    await assert.rejects(refreshLegacyStorageProjection(db,db,options),publicError);
  }
});

test('disposable PostgreSQL projection refresh is atomic and sealed', {skip:!available, timeout:60000}, async t => {
  const dir = await mkdtemp(join(tmpdir(),'byus-storage-projection-'));
  const listener = createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port = listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(port)});
  const command = (cmd,args) => {
    const result=spawnSync(cmd,args,{env,encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,`${cmd} fixture setup failed`);
  };
  const db = name => ({calls:[],run(sql,{json=true}={}) {
    this.calls.push(sql);
    const result=spawnSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate',
      '-v','application_roles_json=["anon","authenticated","service_role"]','-d',name],
    {input:sql,env,encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024});
    if(result.status!==0) throw new Error('PRIVATE SQL/error must never escape');
    return json?JSON.parse(result.stdout.trim()):result.stdout.trim();
  }});
  const source=db('projection_source'), target=db('projection_target');
  let started=false,passed=false;
  try {
    command('initdb',['-D',join(dir,'pg'),'-A','trust','--no-locale','-E','UTF8']);
    command('pg_ctl',['-D',join(dir,'pg'),'-l',join(dir,'pg.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
    command('createdb',['projection_source']);command('createdb',['projection_target']);
    source.run('create role anon;create role authenticated;create role service_role;', {json:false});
    for(const database of [source,target]) {
      database.run(await file('legacy-storage.sql'),{json:false});
      database.run(`insert into storage.buckets(id,name,public) values ('keep','private',false),('obsolete','old',false);
        insert into storage.objects(id,bucket_id,name,metadata,user_metadata) values
        ('11111111-1111-4111-8111-111111111111','keep','private-original', '{"size":1}', '{"sha256":"initial"}'),
        ('22222222-2222-4222-8222-222222222222','keep','private-second','{"size":2}',null),
        ('33333333-3333-4333-8333-333333333333','obsolete','deleted-private-path',null,null);`,{json:false});
    }
    target.run(`create table public.s3_storage_objects(id text primary key,bucket_id text references storage.buckets(id),name text default 'default',unique(bucket_id,name));
      create table public.s3_storage_delete_outbox(bucket_id text,name text,foreign key(bucket_id,name) references public.s3_storage_objects(bucket_id,name));
      create table public.s3_storage_migration_objects(bucket_id text,name text,deleted_at timestamptz,foreign key(bucket_id,name) references public.s3_storage_objects(bucket_id,name));
      insert into public.s3_storage_objects(id,bucket_id) values('preserved','keep');`,{json:false});
    target.run(await file('seal-legacy-storage.sql'),{json:false});
    const inventorySql=await file('storage-inventory.sql');
    const inventory=()=>target.run(inventorySql);
    const baseline=inventory(),expectedShapeHash=shapeHash(baseline);
    const refresh=(s=source,tr=target)=>refreshLegacyStorageProjection(s,tr,{...ready,expectedShapeHash});
    const assertSealed=()=>assert.deepEqual(inventory().relations.map(x=>x.guard.enabled),['A','A']);
    const assertSame=()=>assert.deepEqual(target.run(awaitExport,{json:true}),source.run(awaitExport,{json:true}));
    const awaitExport=await file('storage-export.sql');
    await t.test('source additions, metadata updates, deletions, id/path swaps and bucket removals',async()=>{
      source.run(`update storage.objects set name='temporary' where id='11111111-1111-4111-8111-111111111111';
        update storage.objects set name='private-original' where id='22222222-2222-4222-8222-222222222222';
        update storage.objects set name='private-second',metadata='{"size":999,"text":"quote '' slash \\\\ $byus_projection$"}',user_metadata='{"sha256":"changed"}' where id='11111111-1111-4111-8111-111111111111';
        delete from storage.objects where bucket_id='obsolete';delete from storage.buckets where id='obsolete';
        insert into storage.buckets values('new','new-private',false,4096,array['image/png']);
        insert into storage.objects values('44444444-4444-4444-8444-444444444444','new','added-private',null,'{}');`,{json:false});
      const before=target.calls.length;
      const receipt=await refresh();
      assert.equal(target.calls.length-before,2,'one initial read, exactly one target transaction');
      const transaction=target.calls.at(-1);
      assert.match(transaction,/^begin;/);assert.match(transaction,/commit;$/);
      assert.match(transaction,/lock table storage.buckets, storage.objects in access exclusive mode/);
      assert.equal(receipt.objects.rows,'3');assert.match(receipt.objects.sha256,/^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(receipt).sort(),['buckets','objects']);
      assertSame();assertSealed();assert.equal(shapeHash(inventory()),expectedShapeHash);
      assert.equal(target.run('select count(*) from public.s3_storage_objects;',{json:false}),'1');
      source.run(`update storage.objects set id='55555555-5555-4555-8555-555555555555' where id='11111111-1111-4111-8111-111111111111';
        update storage.objects set id='11111111-1111-4111-8111-111111111111' where id='22222222-2222-4222-8222-222222222222';
        update storage.objects set id='22222222-2222-4222-8222-222222222222' where id='55555555-5555-4555-8555-555555555555';
        update storage.objects set metadata='{"large":9007199254740993123456789,"decimal":0.12345678901234567890123456789}' where bucket_id='new';`,{json:false});
      await refresh();assertSame();assertSealed();
    });
    await t.test('failed post-write projection comparison rolls back rows and seals',async()=>{
      const before=inventory();
      const corrupt={run(sql,opts){const value=source.run(sql,opts);const payload=JSON.parse(value.snapshot);payload.objects[0].metadata={private:'changed-before-rollback'};value.snapshot=JSON.stringify(payload);value.projection.objects.sha256='0'.repeat(64);return value;}};
      await assert.rejects(refresh(corrupt),publicError);
      assert.deepEqual(inventory(),before);assertSealed();
    });
    await t.test('bucket referenced by S3 metadata cannot be deleted; all changes roll back',async()=>{
      const before=inventory();
      const corrupt={run(sql,opts){const value=source.run(sql,opts);const payload=JSON.parse(value.snapshot);payload.objects=payload.objects.filter(x=>x.bucket_id!=='keep');payload.buckets=payload.buckets.filter(x=>x.id!=='keep');value.snapshot=JSON.stringify(payload);return value;}};
      await assert.rejects(refresh(corrupt),publicError);
      assert.deepEqual(inventory(),before);assertSealed();
    });
    await t.test('preexisting replica-written S3 orphans are rejected without changing rows or seals',async()=>{
      for(const [table,columns,values,condition] of [
        ['s3_storage_objects','id,bucket_id',"'orphan','missing'","id='orphan'"],
        ['s3_storage_delete_outbox','bucket_id,name',"'keep','missing'","name='missing'"],
        ['s3_storage_migration_objects','bucket_id,name,deleted_at',"'keep','missing',now()","name='missing'"],
      ]){
        target.run(`set session_replication_role=replica;insert into public.${table}(${columns}) values(${values});`,{json:false});
        const before=inventory();await assert.rejects(refresh(),publicError);assert.deepEqual(inventory(),before);assertSealed();
        target.run(`delete from public.${table} where ${condition};`,{json:false});
      }
    });
    await t.test('incoming object foreign key is refused before deletion',async()=>{
      target.run('create table public.object_reference(id uuid references storage.objects(id));',{json:false});
      const before=inventory();
      await assert.rejects(refresh(),publicError);assert.deepEqual(inventory(),before);assertSealed();
      target.run('drop table public.object_reference;',{json:false});
    });
    await t.test('initial shape drift fails before reading customer source',async()=>{
      target.run('grant select on storage.objects to anon;',{json:false});
      let sourceReads=0;await assert.rejects(refresh({run(){sourceReads++;throw new Error('unexpected read');}}),publicError);assert.equal(sourceReads,0);
      target.run('revoke select on storage.objects from anon;',{json:false});
      assert.equal(shapeHash(inventory()),expectedShapeHash);
    });
    await t.test('shape drift between initial observation and locked transaction fails',async()=>{
      const raced={run(sql,opts){const value=source.run(sql,opts);target.run('grant select on storage.buckets to anon;',{json:false});return value;}};
      const beforeProjection=inventory().projection;
      await assert.rejects(refresh(raced),publicError);
      assert.deepEqual(inventory().projection,beforeProjection);assertSealed();
      target.run('revoke select on storage.buckets from anon;',{json:false});
    });
    await t.test('seal drift and source errors expose only the standard error',async()=>{
      target.run('alter table storage.objects enable trigger byus_metadata_read_only;',{json:false});
      await assert.rejects(refresh(),publicError);
      target.run('alter table storage.objects enable always trigger byus_metadata_read_only;',{json:false});
      await assert.rejects(refresh({run(){throw new Error('customer private-original secret');}}),publicError);
      assertSealed();
    });
    passed=true;
  } finally {
    if(started)spawnSync('pg_ctl',['-D',join(dir,'pg'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});
    if(passed)await rm(dir,{recursive:true,force:true});
    else console.error('Disposable projection fixture retained:',dir);
  }
});

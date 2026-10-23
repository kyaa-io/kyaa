import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createServer} from 'node:net';
const available=['initdb','pg_ctl','psql','createdb'].every(cmd=>spawnSync('which',[cmd]).status===0);
test('disposable PG17 fixture exercises exact large numbers, enum, identity, generation and transactions',{skip:!available},async()=>{
 const here=dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(join(tmpdir(),'byus-dms-sql-'));await mkdir(join(temp,'socket'));
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];Object.assign(env,{PGHOST:join(temp,'socket'),PGPORT:String(port)});
 const run=(cmd,args,options={})=>{const x=spawnSync(cmd,args,{env,encoding:'utf8',timeout:30000,...options});assert.equal(x.status,0,x.stderr);return x.stdout.trim();};
 const sql=(db,user,input)=>run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',db,'-U',user],{input});let started=false;
 try{
  run('initdb',['-D',join(temp,'data'),'-A','trust','--no-instructions']);run('pg_ctl',['-D',join(temp,'data'),'-l',join(temp,'postgres.log'),'-o',`-p ${port} -k ${join(temp,'socket')} -c listen_addresses=''`,'-w','start']);started=true;
  assert.equal(sql('postgres',process.env.USER,"select current_setting('server_version_num')::int/10000;"),'17');
  sql('postgres',process.env.USER,'create role byus_dms_fixture_source login;create role byus_dms_fixture_target login;grant set on parameter session_replication_role to byus_dms_fixture_target;');
  for(const db of ['byus_dms_fixture_source','byus_dms_fixture_target']){run('createdb',['-O',db,db]);sql(db,db,await readFile(join(here,'schema.sql'),'utf8'));}
  const source=(text)=>sql('byus_dms_fixture_source','byus_dms_fixture_source',text);
  const target=(text)=>sql('byus_dms_fixture_target','byus_dms_fixture_target',text);
  const prepare=await readFile(join(here,'target-prepare.sql'),'utf8'),finalize=await readFile(join(here,'target-finalize.sql'),'utf8');
  target(prepare);
  assert.equal(target("select attidentity from pg_attribute where attrelid='byus_dms_fixture.records'::regclass and attname='id';"),'d');
  const invalidPrepare=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d','byus_dms_fixture_source','-U','byus_dms_fixture_source'],{env,input:prepare,encoding:'utf8'});assert.notEqual(invalidPrepare.status,0);
  target("insert into byus_dms_fixture.owners values('11111111-1111-4111-8111-111111111111','fixture');insert into byus_dms_fixture.records(id,owner_id,payload,document,data,tags,fixed_num,unbounded_num,mood) values(1002,'11111111-1111-4111-8111-111111111111','fixture','{}','\\x00','{}',1,1,'준비');insert into byus_dms_fixture.barriers values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cdc-complete','fixture');");
  target(finalize);
  assert.equal(target("select attidentity from pg_attribute where attrelid='byus_dms_fixture.records'::regclass and attname='id';"),'a');
  assert.equal(target("select nextval(pg_get_serial_sequence('byus_dms_fixture.records','id'));"),'1003');
  const snapshot=await readFile(join(here,'snapshot.sql'),'utf8');
  source(await readFile(join(here,'seed.sql'),'utf8'));const initial=JSON.parse(source(snapshot));assert.equal(initial.phase,'initial');assert.equal(initial.records.rows,1);assert.equal(initial.identityDefinition,'a');
  assert.equal(source("select fixed_num::text=repeat('9',78) and unbounded_num::text='1234567890123456789012345678901234567890.12345678901234567890' and id=1001 from byus_dms_fixture.records;"),'t');
  source(await readFile(join(here,'cdc.sql'),'utf8'));const cdc=JSON.parse(source(snapshot));assert.equal(cdc.phase,'cdc-complete');assert.equal(cdc.records.rows,2);assert(cdc.rollbackAbsent&&cdc.foreignKeysValid&&cdc.generationValid);assert.notEqual(initial.records.sha256,cdc.records.sha256);
  assert.equal(source("select count(*)=2 and min(id)=1001 and max(id)=1002 and bool_and(unbounded_num::text='9876543210987654321098765432109876543210.98765432109876543210') from byus_dms_fixture.records;"),'t');
  const wrong=spawnSync('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d','byus_dms_fixture_target','-U','byus_dms_fixture_target'],{env,input:await readFile(join(here,'seed.sql'),'utf8'),encoding:'utf8'});assert.notEqual(wrong.status,0);
  assert.equal(sql('byus_dms_fixture_target','byus_dms_fixture_target',"set session_replication_role=replica;select current_setting('session_replication_role');"),'replica');
  source(await readFile(join(here,'oversize-lob.sql'),'utf8'));assert.equal(source('select octet_length(data) from byus_dms_fixture.records where id=1001;'),'2097152');
 }finally{if(started)spawnSync('pg_ctl',['-D',join(temp,'data'),'-m','immediate','-w','stop'],{env,stdio:'ignore'});await rm(temp,{recursive:true,force:true});}
});

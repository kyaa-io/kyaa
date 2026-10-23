import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {PIN,validateConfig,validateSecret,endpointInput,assertEndpoint,assertTask} from './aws-dms-fixture.mjs';
const c={accountId:PIN.accountId,region:PIN.region,profile:PIN.profile,sourceSecretArn:`arn:aws:secretsmanager:${PIN.region}:${PIN.accountId}:secret:byus/prod/dms-fixture/source-20261023-AbCd12`,targetSecretArn:`arn:aws:secretsmanager:${PIN.region}:${PIN.accountId}:secret:byus/prod/dms-fixture/target-20261023-EfGh34`,certificateArn:`arn:aws:dms:${PIN.region}:${PIN.accountId}:cert:FIXTURE`};
const mappings=JSON.parse(await readFile(new URL('../infrastructure/aws/database/dms-fixture/table-mappings.json',import.meta.url))),settings=JSON.parse(await readFile(new URL('../infrastructure/aws/database/dms-fixture/task-settings.json',import.meta.url)));
test('configuration and private secret checks reject source/target reversal, application DB hosts and master logins',()=>{
 assert.doesNotThrow(()=>validateConfig(c));
 for(const patch of [{accountId:'200151116034'},{region:'us-east-1'},{profile:'coredot-dev'},{sourceSecretArn:c.targetSecretArn},{targetSecretArn:c.sourceSecretArn},{database:'byus'},{sourceHost:'db.gmrykvmtmuaeswpajteq.supabase.co'},{certificateArn:''}])assert.throws(()=>validateConfig({...c,...patch}));
 const secret={host:PIN.host,port:5432,username:'byus_dms_fixture_source',password:'fixture-password-only-123456'};
 assert.doesNotThrow(()=>validateSecret(secret,'source'));
 for(const patch of [{username:'byus_admin'},{username:'byus_dms_fixture_target'},{host:'db.gmrykvmtmuaeswpajteq.supabase.co'},{port:15433},{dbname:'byus'}])assert.throws(()=>validateSecret({...secret,...patch},'source'));
});
test('both endpoints require imported CA/verify-full, exact separate DBs and dedicated secret roles',()=>{
 for(const side of ['source','target']){
  const endpoint=endpointInput(c,side);assert.equal(endpoint.DatabaseName,`byus_dms_fixture_${side}`);assert.equal(endpoint.SslMode,'verify-full');assert.equal(endpoint.CertificateArn,c.certificateArn);assert.equal(endpoint.UserName,undefined);assert.equal(endpoint.Password,undefined);assert.equal(endpoint.ServerName,undefined);
  assert.doesNotThrow(()=>assertEndpoint(endpoint,endpoint));
  for(const patch of [{DatabaseName:'byus'},{SslMode:'require'},{CertificateArn:'other'},{ServerName:'db.gmrykvmtmuaeswpajteq.supabase.co'}])assert.throws(()=>assertEndpoint({...endpoint,...patch},endpoint));
 }
 const source=endpointInput(c,'source').PostgreSQLSettings;assert.equal(source.CaptureDdls,false);assert.equal(source.FailTasksOnLobTruncation,true);assert.equal(source.PluginName,'test_decoding');assert.equal(source.AfterConnectScript,undefined);
 const sourceEndpoint=endpointInput(c,'source');assert.doesNotThrow(()=>assertEndpoint({...sourceEndpoint,EndpointType:'SOURCE',PostgreSQLSettings:{...source,PluginName:'test-decoding'}},sourceEndpoint));
 assert.equal(endpointInput(c,'target').PostgreSQLSettings.AfterConnectScript,'SET session_replication_role=replica');
 assert.match(endpointInput(c,'target').ExtraConnectionAttributes,/;loadUsingCSV=false$/);
});
test('task is only explicit fixture tables, limited 1MiB LOB, generated column exclusion and stop on errors',()=>{
 const selected=mappings.rules.filter(r=>r['rule-type']==='selection');assert.equal(selected.length,3);assert.deepEqual(selected.map(r=>r['object-locator']['table-name']).sort(),['barriers','owners','records']);
 for(const r of selected){assert.equal(r['rule-action'],'explicit');assert.equal(r['object-locator']['schema-name'],'byus_dms_fixture');}
 assert.equal(mappings.rules[3]['rule-action'],'remove-column');assert.equal(mappings.rules[3]['object-locator']['column-name'],'generated_fingerprint');
 assert.equal(settings.FullLoadSettings.TargetTablePrepMode,'DO_NOTHING');assert.equal(settings.FullLoadSettings.MaxFullLoadSubTasks,1);assert.equal(settings.TargetMetadata.FullLobMode,false);assert.equal(settings.TargetMetadata.LimitedSizeLobMode,true);assert.equal(settings.TargetMetadata.LobMaxSize,1024);assert.equal(settings.TargetMetadata.BatchApplyEnabled,false);assert.equal(settings.TargetMetadata.ParallelApplyThreads,0);
 for(const key of ['DataErrorPolicy','DataTruncationErrorPolicy','TableErrorPolicy','ApplyErrorInsertPolicy','ApplyErrorUpdatePolicy'])assert.equal(settings.ErrorBehavior[key],'STOP_TASK');
 const endpoints={source:{EndpointArn:'source'},target:{EndpointArn:'target'}};
 const task={ReplicationTaskIdentifier:PIN.stack,ReplicationInstanceArn:'instance',SourceEndpointArn:'source',TargetEndpointArn:'target',MigrationType:'full-load-and-cdc',TableMappings:JSON.stringify(mappings),ReplicationTaskSettings:JSON.stringify(settings)};
 assert.doesNotThrow(()=>assertTask(task,'instance',endpoints,mappings,settings));
 assert.throws(()=>assertTask({...task,SourceEndpointArn:'target'},'instance',endpoints,mappings,settings));
 assert.throws(()=>assertTask({...task,TableMappings:'{"rules":[]}'},'instance',endpoints,mappings,settings));
 const weakened=structuredClone(settings);weakened.TargetMetadata.FullLobMode=true;assert.throws(()=>assertTask({...task,ReplicationTaskSettings:JSON.stringify(weakened)},'instance',endpoints,mappings,settings));
});
test('CloudFormation is private, pinned to prod APP subnets and grants each secret role one ARN',async()=>{
 const t=JSON.parse(await readFile(new URL('../infrastructure/aws/database/dms-fixture/infrastructure.json',import.meta.url))),r=t.Resources;
 assert.equal(r.Instance.Properties.PubliclyAccessible,false);assert.equal(r.Instance.Properties.ReplicationInstanceClass,'dms.t3.medium');assert.equal(r.Instance.Properties.EngineVersion,'3.6.1');assert.deepEqual(r.SubnetGroup.Properties.SubnetIds,PIN.subnets);assert.equal(r.SecurityGroup.Properties.VpcId,PIN.vpc);assert.deepEqual(r.SecurityGroup.Properties.SecurityGroupIngress,[]);
 for(const side of ['Source','Target'])assert.deepEqual(r[side+'SecretRole'].Properties.Policies[0].PolicyDocument.Statement,[{Effect:'Allow',Action:'secretsmanager:GetSecretValue',Resource:{Ref:side+'SecretArn'}}]);
 assert.equal(Object.values(r).some(r=>r.Type==='AWS::DMS::ReplicationTask'||r.Type==='AWS::DMS::Endpoint'),false);
});
test('all actions default to no AWS execution and never render credential values',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'byus-dms-plan-'));
 try{
  const file=join(directory,'config.json');await writeFile(file,JSON.stringify(c));
  for(const completion of [[],['--completion']])for(const action of ['plan','create-endpoints','test-connections','create-task','start','status','stop']){
   const x=spawnSync(process.execPath,[resolve('scripts/aws-dms-fixture.mjs'),action,...completion,'--config',file,'--out',directory],{env:{...process.env,PATH:'/does-not-exist'},encoding:'utf8'});assert.equal(x.status,0,x.stderr);assert.equal(JSON.parse(x.stdout).executed,false);
  }
  const input=JSON.parse(await readFile(join(directory,'endpoint-source.json'),'utf8'));assert.equal(input.Password,undefined);assert.equal(input.UserName,undefined);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('completion proof requires matching actual initial/CDC snapshots and per-table DMS delete/update counters',async()=>{
 const {completionEvidence}=await import('./aws-dms-fixture.mjs');
 const previous={syntheticOnly:true,customerDataReadOrReplicated:false,initialExactValues:true,cdcExactValues:true,oversize2097152BytesRejectedAt1048576Limit:true,targetUnchangedAfterRejectedOversize:true,identityRestoredToAlways:true};
 const initial={phase:'initial',textKeys:{rows:2,sha256:'a'.repeat(64)},compositeKeys:{rows:3,sha256:'b'.repeat(64)},textPrimaryKey:true,compositePrimaryKey:true,neighbourPreserved:true,deletedAbsent:false,updatedPresent:false};
 const final={...initial,phase:'cdc-complete',textKeys:{rows:1,sha256:'c'.repeat(64)},compositeKeys:{rows:2,sha256:'d'.repeat(64)},deletedAbsent:true,updatedPresent:true};
 const proof={initialSource:initial,initialTarget:structuredClone(initial),finalSource:final,finalTarget:structuredClone(final),status:{executed:true,task:{identifier:PIN.stack+'-completion',statistics:{FullLoadProgressPercent:100,TablesLoaded:3,TablesErrored:0},status:'running',arn:'arn:aws:dms:ap-northeast-2:996702758024:task:FIXTURE',hasFailure:false},tables:['text_keys','composite_keys'].map(table=>({schema:'byus_dms_fixture',table,deletes:1,updates:1}))}};
 const result=completionEvidence(previous,proof);assert(result.textPrimaryKey&&result.compositePrimaryKey&&result.deletePreserved);
 for(const mutate of [p=>p.finalTarget.textKeys.rows++,p=>p.status.tables[0].deletes=0,p=>p.status.tables[1].updates=0,p=>p.finalSource.deletedAbsent=false,p=>p.initialTarget.textPrimaryKey=false,p=>p.status.task.hasFailure=true]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>completionEvidence(previous,bad));}
 assert.throws(()=>completionEvidence({...previous,identityRestoredToAlways:false},proof));
 const selected=JSON.parse(await readFile(new URL('../infrastructure/aws/database/dms-fixture/completion-table-mappings.json',import.meta.url))).rules;
 assert.deepEqual(selected.map(r=>r['object-locator']['table-name']),['text_keys','composite_keys','completion_barriers']);assert(selected.every(r=>r['object-locator']['schema-name']==='byus_dms_fixture'&&r['rule-action']==='explicit'));
});

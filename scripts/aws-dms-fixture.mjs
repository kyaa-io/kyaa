#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),FILES=join(ROOT,'infrastructure/aws/database/dms-fixture');
export const PIN={accountId:'996702758024',region:'ap-northeast-2',profile:'jewel-sallylab',stack:'byus-prod-dms-fixture',host:'byus-prod-platform-database-40n9gar79vuq.chaamoiiyd3w.ap-northeast-2.rds.amazonaws.com',vpc:'vpc-01e9e4c41c168ef70',subnets:['subnet-01747b4f8ffb85ded','subnet-0356be17ae6217f04']};
const fail=message=>{throw new Error(message);};
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function validateConfig(c){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['accountId','region','profile','sourceSecretArn','targetSecretArn','certificateArn'].includes(k)))fail('Use only fixture configuration fields');
 for(const key of ['accountId','region','profile'])if(c[key]!==PIN[key])fail(`Fixture ${key} must match the approved identity`);
 for(const side of ['source','target'])if(!new RegExp(`^arn:aws:secretsmanager:${PIN.region}:${PIN.accountId}:secret:byus/prod/dms-fixture/${side}-[A-Za-z0-9_-]+-[A-Za-z0-9]{6}$`).test(c[side+'SecretArn']??''))fail(`Exact dedicated ${side} secret ARN required`);
 if(!new RegExp(`^arn:aws:dms:${PIN.region}:${PIN.accountId}:cert:[A-Za-z0-9_-]+$`).test(c.certificateArn??''))fail('Imported DMS certificate ARN required');
 return c;
}
export function validateSecret(secret,side){
 if(!secret||Object.keys(secret).some(k=>!['host','port','username','password'].includes(k))||secret.host!==PIN.host||String(secret.port)!=='5432'||secret.username!==`byus_dms_fixture_${side}`||typeof secret.password!=='string'||secret.password.length<16||/[;.:+{}*&,%\\]/.test(secret.password))fail(`Dedicated ${side} fixture secret identity/shape invalid`);
}
export function endpointInput(c,side){
 return {EndpointIdentifier:`${PIN.stack}-${side}`,EndpointType:side,EngineName:'postgres',DatabaseName:`byus_dms_fixture_${side}`,SslMode:'verify-full',CertificateArn:c.certificateArn,ExtraConnectionAttributes:'mapUnboundedNumericAsString=true'+(side==='target'?';loadUsingCSV=false':''),PostgreSQLSettings:{SecretsManagerSecretId:c[side+'SecretArn'],SecretsManagerAccessRoleArn:`arn:aws:iam::${PIN.accountId}:role/${PIN.stack}-${side}-secret-role`,MapJsonbAsClob:side==='target',...(side==='source'?{CaptureDdls:false,PluginName:'test_decoding',FailTasksOnLobTruncation:true}:{AfterConnectScript:'SET session_replication_role=replica'})},Tags:[{Key:'Purpose',Value:'synthetic-dms-fixture'}]};
}
export function assertEndpoint(endpoint,expected){
 for(const key of ['EndpointIdentifier','EngineName','DatabaseName','SslMode','CertificateArn','ExtraConnectionAttributes'])if(endpoint[key]!==expected[key])fail('Existing endpoint differs from pinned fixture settings');
 if(endpoint.EndpointType?.toLowerCase()!==expected.EndpointType)fail('Existing endpoint direction differs');
 for(const [key,value] of Object.entries(expected.PostgreSQLSettings))if((key==='PluginName'?endpoint.PostgreSQLSettings?.[key]?.replaceAll('-','_'):endpoint.PostgreSQLSettings?.[key])!==value)fail('Existing endpoint authentication/CDC settings differ');
 if(endpoint.ServerName&&endpoint.ServerName!==PIN.host)fail('Endpoint host is not the approved fixture RDS');
}
export function assertTask(task,instanceArn,endpoints,mappings,settings,identifier=PIN.stack){
 if(task.ReplicationTaskIdentifier!==identifier||task.ReplicationInstanceArn!==instanceArn||task.SourceEndpointArn!==endpoints.source.EndpointArn||task.TargetEndpointArn!==endpoints.target.EndpointArn||task.MigrationType!=='full-load-and-cdc'||stable(JSON.parse(task.TableMappings))!==stable(mappings))fail('Task identity or exact table mapping differs');
 const actual=JSON.parse(task.ReplicationTaskSettings);
 for(const [section,values] of Object.entries(settings))for(const [key,value] of Object.entries(values))if(stable(actual[section]?.[key])!==stable(value))fail('Task safety setting differs');
}
// Combine independent real runs only after exact snapshots and task counters agree.
export function completionEvidence(previous,{initialSource,initialTarget,finalSource,finalTarget,status}){
 for(const key of ['syntheticOnly','initialExactValues','cdcExactValues','oversize2097152BytesRejectedAt1048576Limit','targetUnchangedAfterRejectedOversize','identityRestoredToAlways'])if(previous[key]!==true)fail('Existing fixture proof is incomplete');
 if(previous.customerDataReadOrReplicated!==false)fail('Synthetic fixture proof required');
 if(status.task?.identifier!==PIN.stack+'-completion'||status.task?.status!=='running'||status.task.hasFailure||!/^arn:aws:dms:ap-northeast-2:996702758024:task:[A-Za-z0-9]+$/.test(status.task.arn??'')||!status.executed||status.task.statistics?.FullLoadProgressPercent!==100||status.task.statistics?.TablesLoaded!==3||status.task.statistics?.TablesErrored!==0)fail('Actual running completion task required');
 for(const [source,target,phase,textRows,compositeRows] of [[initialSource,initialTarget,'initial',2,3],[finalSource,finalTarget,'cdc-complete',1,2]]){
  if(stable(source)!==stable(target)||source.phase!==phase||!source.textPrimaryKey||!source.compositePrimaryKey||!source.neighbourPreserved)fail('Exact completion snapshots and primary keys required');
  for(const [key,rows] of [['textKeys',textRows],['compositeKeys',compositeRows]])if(source[key]?.rows!==rows||!/^[a-f0-9]{64}$/.test(source[key]?.sha256??''))fail('Completion row counts/digests invalid');
 }
 if(!finalSource.deletedAbsent||!finalSource.updatedPresent||initialSource.deletedAbsent||initialSource.updatedPresent)fail('Committed DELETE/UPDATE proof required');
 for(const [table,key] of [['text_keys','textKeys'],['composite_keys','compositeKeys']]){
  const stats=status.tables?.filter(t=>t.schema==='byus_dms_fixture'&&t.table===table);
  if(stats?.length!==1||stats[0].deletes!==1||stats[0].updates!==1||initialSource[key].sha256===finalSource[key].sha256)fail('Actual DMS DELETE/UPDATE counters and changed hashes required');
 }
 return {...previous,textPrimaryKey:finalSource.textPrimaryKey,compositePrimaryKey:finalSource.compositePrimaryKey,deletePreserved:finalSource.deletedAbsent&&finalSource.neighbourPreserved,completionValidatedAt:new Date().toISOString()};
}
function aws(args){
 const result=spawnSync('aws',['--no-cli-pager','--profile',PIN.profile,'--region',PIN.region,...args,'--output','json'],{encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.status!==0||result.error)fail(`AWS ${args.slice(0,2).join(' ')} failed; credentials and provider diagnostics suppressed`);
 try{return JSON.parse(result.stdout||'{}');}catch{fail('AWS response was not JSON');}
}
const one=(items,label)=>{if(items?.length!==1)fail(`Expected exactly one ${label}`);return items[0];};
export async function main(argv=process.argv.slice(2)){
 const action=argv[0]&&!argv[0].startsWith('--')?argv.shift():'plan';
 if(!['plan','create-endpoints','test-connections','create-task','start','status','stop'].includes(action))fail('Unknown fixture action');
 const flags={};for(let i=0;i<argv.length;i++){const flag=argv[i];if(!['--config','--out','--execute','--completion'].includes(flag)||flag in flags)fail('Unknown/duplicate flag');flags[flag]=['--execute','--completion'].includes(flag)?true:argv[++i];if(!flags[flag]||String(flags[flag]).startsWith('--'))fail('Missing flag value');}
 if(!flags['--config'])fail('--config is required');if(action==='plan'&&flags['--execute'])fail('Plan cannot execute');
 const c=validateConfig(JSON.parse(await readFile(resolve(flags['--config']),'utf8'))),out=resolve(flags['--out']??join(ROOT,'work/aws-dms-fixture'));await mkdir(out,{recursive:true,mode:0o700});
 const save=async(name,value)=>{const file=join(out,name);await writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});return file;};
 const sourceInput=endpointInput(c,'source'),targetInput=endpointInput(c,'target'),identifier=PIN.stack+(flags['--completion']?'-completion':'');
 const mappings=JSON.parse(await readFile(join(FILES,flags['--completion']?'completion-table-mappings.json':'table-mappings.json'),'utf8')),settings=JSON.parse(await readFile(join(FILES,'task-settings.json'),'utf8'));
 await save('endpoint-source.json',sourceInput);await save('endpoint-target.json',targetInput);
 await save('parameters.json',[{ParameterKey:'SourceSecretArn',ParameterValue:c.sourceSecretArn},{ParameterKey:'TargetSecretArn',ParameterValue:c.targetSecretArn}]);
 if(!flags['--execute']){console.log(JSON.stringify({action,executed:false,out,stack:PIN.stack,databases:['byus_dms_fixture_source','byus_dms_fixture_target'],sourceAndTargetHost:PIN.host}));return;}
 if(aws(['sts','get-caller-identity']).Account!==PIN.accountId)fail('AWS account mismatch');
 const stack=one(aws(['cloudformation','describe-stacks','--stack-name',PIN.stack]).Stacks,'fixture stack');
 if(stack.StackName!==PIN.stack||!['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus))fail('Fixture stack is not ready');
 const outputs=Object.fromEntries(stack.Outputs.map(o=>[o.OutputKey,o.OutputValue]));
 const instance=one(aws(['dms','describe-replication-instances','--filters',`Name=replication-instance-arn,Values=${outputs.ReplicationInstanceArn}`]).ReplicationInstances,'private fixture instance');
 if(instance.PubliclyAccessible!==false||instance.ReplicationInstanceIdentifier!==PIN.stack||instance.ReplicationInstanceStatus!=='available'||instance.ReplicationInstanceClass!=='dms.t3.medium'||instance.EngineVersion!=='3.6.1'||instance.ReplicationSubnetGroup?.VpcId!==PIN.vpc||stable(instance.ReplicationSubnetGroup.Subnets.map(s=>s.SubnetIdentifier).sort())!==stable([...PIN.subnets].sort())||stable(instance.VpcSecurityGroups.map(s=>s.VpcSecurityGroupId))!==stable([outputs.SecurityGroupId]))fail('Fixture instance network/identity not ready');
 if(action!=='status')for(const side of ['source','target']){
  // Root execution only: secret plaintext stays in this child-process response and memory.
  const response=aws(['secretsmanager','get-secret-value','--secret-id',c[side+'SecretArn']]);let secret;try{secret=JSON.parse(response.SecretString);}catch{fail('Fixture secret JSON invalid');}validateSecret(secret,side);
 }
 const endpoints={};for(const side of ['source','target']){
  const found=aws(['dms','describe-endpoints']).Endpoints.filter(e=>e.EndpointIdentifier===`${PIN.stack}-${side}`);
  if(action==='create-endpoints'&&!found.length){const input=side==='source'?sourceInput:targetInput;const result=aws(['dms','create-endpoint','--cli-input-json',`file://${join(out,`endpoint-${side}.json`)}`]);endpoints[side]=result.Endpoint;}
  else endpoints[side]=one(found,side+' fixture endpoint');
  assertEndpoint(endpoints[side],side==='source'?sourceInput:targetInput);
 }
 if(action==='create-endpoints'){console.log(JSON.stringify({action,executed:true,endpointArns:Object.fromEntries(Object.entries(endpoints).map(([side,e])=>[side,e.EndpointArn]))}));return;}
 if(action==='test-connections'){
  for(const side of ['source','target'])aws(['dms','test-connection','--replication-instance-arn',instance.ReplicationInstanceArn,'--endpoint-arn',endpoints[side].EndpointArn]);
  console.log(JSON.stringify({action,executed:true,note:'Test requests submitted; inspect status until both are successful'}));return;
 }
 const connections=aws(['dms','describe-connections']).Connections.filter(c=>c.ReplicationInstanceArn===instance.ReplicationInstanceArn);
 const tasks=aws(['dms','describe-replication-tasks']).ReplicationTasks.filter(t=>t.ReplicationTaskIdentifier===identifier);
 if(action==='create-task'){
  if(tasks.length)fail('Fixture task exists; inspect it rather than recreating/reloading');
  for(const e of Object.values(endpoints))if(!connections.some(c=>c.EndpointArn===e.EndpointArn&&c.Status==='successful'))fail('Both endpoint TLS tests must succeed first');
  const input={ReplicationTaskIdentifier:identifier,SourceEndpointArn:endpoints.source.EndpointArn,TargetEndpointArn:endpoints.target.EndpointArn,ReplicationInstanceArn:instance.ReplicationInstanceArn,MigrationType:'full-load-and-cdc',TableMappings:JSON.stringify(mappings),ReplicationTaskSettings:JSON.stringify(settings),Tags:[{Key:'Purpose',Value:'synthetic-dms-fixture'}]};
  const path=await save('task-input.json',input);aws(['dms','create-replication-task','--cli-input-json',`file://${path}`]);console.log(JSON.stringify({action,executed:true,started:false}));return;
 }
 const task=tasks.length?one(tasks,'fixture task'):null;
 if(task)assertTask(task,instance.ReplicationInstanceArn,endpoints,mappings,settings,identifier);
 if(action==='start'){
  if(!task||task.Status!=='ready')fail('Only a fresh ready fixture task may be started');
  for(const e of Object.values(endpoints))if(!connections.some(c=>c.EndpointArn===e.EndpointArn&&c.Status==='successful'))fail('Both TLS endpoint tests must be successful');
  aws(['dms','start-replication-task','--replication-task-arn',task.ReplicationTaskArn,'--start-replication-task-type','start-replication']);
  console.log(JSON.stringify({action,executed:true,requestAccepted:true,taskArn:task.ReplicationTaskArn}));return;
 }else if(action==='stop'){
  if(!task||!['running','starting'].includes(task.Status))fail('Only an active fixture task may be stopped');
  aws(['dms','stop-replication-task','--replication-task-arn',task.ReplicationTaskArn]);
  console.log(JSON.stringify({action,executed:true,requestAccepted:true,taskArn:task.ReplicationTaskArn}));return;
 }
 const tables=task&&['running','stopped','failed'].includes(task.Status)?aws(['dms','describe-table-statistics','--replication-task-arn',task.ReplicationTaskArn]).TableStatistics:[];
 console.log(JSON.stringify({action,executed:true,connections:connections.filter(c=>Object.values(endpoints).some(e=>e.EndpointArn===c.EndpointArn)).map(c=>({endpointArn:c.EndpointArn,status:c.Status})),task:task?{identifier:task.ReplicationTaskIdentifier,arn:task.ReplicationTaskArn,status:task.Status,statistics:task.ReplicationTaskStats,hasFailure:!!task.LastFailureMessage}:null,tables:tables.map(t=>({schema:t.SchemaName,table:t.TableName,state:t.TableState,inserts:t.Inserts,updates:t.Updates,deletes:t.Deletes})),proof:'Counts/status are not data correctness; compare actual snapshot.sql results and committed barrier rows'}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

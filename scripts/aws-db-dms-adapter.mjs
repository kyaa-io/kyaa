import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,ident,literal,catalogHash,objectFingerprints} from './aws-db-migrate.mjs';
import {refreshLegacyStorageProjection} from './aws-db-storage-projection.mjs';
import {IDENTITY_IMPORT_ROLE,IDENTITY_IMPORT_TABLES,identityRoleCheck,identityTableProof,validateIdentityReceipt,readIdentitySnapshot} from './aws-db-identity-import.mjs';
const FILES=resolve(dirname(fileURLToPath(import.meta.url)),'../infrastructure/aws/database/dms-copy');
export const STORAGE_IMPORT_ROLE='byus_storage_migrator';
export const STORAGE_IMPORT_TABLES=['s3_storage_objects','s3_storage_delete_outbox','s3_storage_migration_objects'];
const table=t=>`${ident(t.schema)}.${ident(t.name)}`;
const sorted=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const fail=m=>{throw new Error(m);};
export async function authSafetyInventory(c,source,trustedRoles){
 const sql=String.raw`-- Metadata only. Trusted managed DDL actors are supplied by the pinned review.
with recursive trusted as(select unnest(__BYUS_TRUSTED_ROLES__) name),
required as(select distinct name from (select :'migration_role' name union all select 'supabase_auth_admin' union all select 'authenticator' union all select 'service_role' union all select jsonb_array_elements_text(:'application_roles_json'::jsonb)) q),
edges as(select a.oid member,r.oid roleid from pg_roles a cross join pg_roles r where pg_has_role(a.oid,r.oid,'USAGE') or pg_has_role(a.oid,r.oid,'SET') union select member,roleid from pg_auth_members where admin_option),
role_reach(actor,roleid) as(select oid,oid from pg_roles where (rolcanlogin and rolname not in(select name from trusted)) or rolname in(select name from required) union select rr.actor,e.roleid from role_reach rr join edges e on e.member=rr.roleid),
actors as(select r.* from pg_roles r where r.rolname in(select name from required) or r.oid in(select rr.actor from role_reach rr join pg_roles p on p.oid=rr.roleid where has_table_privilege(p.oid,'auth.users','INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(p.oid,'auth.users','INSERT,UPDATE'))),
reachable as(select distinct r.* from actors a join role_reach rr on rr.actor=a.oid join pg_roles r on r.oid=rr.roleid),
privileged_functions as(select p.*,n.nspname,n.nspacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles owner on owner.oid=p.proowner
 where p.prokind in('f','p') and (p.prosecdef and (owner.rolsuper or has_parameter_privilege(owner.oid,'session_replication_role','SET')) or exists(select from unnest(p.proconfig) cfg where split_part(cfg,'=',1)='session_replication_role'))
 and exists(select from role_reach rr join pg_roles r on r.oid=rr.roleid where has_schema_privilege(r.oid,n.oid,'USAGE') and has_function_privilege(r.oid,p.oid,'EXECUTE')))
select jsonb_build_object(
 'requiredRolesPresent',(select count(*)=(select count(*) from required) from pg_roles where rolname in(select name from required)),
 'trustedRolesPresent',(select count(*)=(select count(*) from trusted) from pg_roles where rolname in(select name from trusted)),
 'owner',(select pg_get_userbyid(relowner) from pg_class where oid='auth.users'::regclass),
 'regular',(select relkind='r' and not relispartition from pg_class where oid='auth.users'::regclass),
 'inheritance',(select count(*) from pg_inherits where inhrelid='auth.users'::regclass or inhparent='auth.users'::regclass),
 'subscriptions',(select count(*) from pg_subscription where subdbid=(select oid from pg_database where datname=current_database())),
 'rules',(select count(*) from pg_rewrite where ev_class='auth.users'::regclass),
 'tableAcl',(select relacl::text from pg_class where oid='auth.users'::regclass),
 'columnAcls',(select coalesce(jsonb_agg(jsonb_build_object('column',attname,'acl',attacl::text) order by attnum),'[]') from pg_attribute where attrelid='auth.users'::regclass and attnum>0 and not attisdropped),
 'parameterAcl',(select coalesce(jsonb_agg(jsonb_build_object('parameter',parname,'acl',paracl::text) order by parname),'[]') from pg_parameter_acl where parname='session_replication_role'),
 'canInspectWriterSessions',pg_has_role(current_user,'pg_read_all_stats','USAGE'),
 'canTrigger',has_table_privilege(current_user,'auth.users','TRIGGER'),
 'currentReplicaMode',current_setting('session_replication_role'),
 'replicaSettingSource',(select source from pg_settings where name='session_replication_role'),
 'actors',(select coalesce(jsonb_agg(rolname order by rolname),'[]') from actors),
 'reachableRoles',(select coalesce(jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'createrole',rolcreaterole,'login',rolcanlogin,'replication',rolreplication,'setReplica',has_parameter_privilege(oid,'session_replication_role','SET'),'alterSystemReplica',has_parameter_privilege(oid,'session_replication_role','ALTER SYSTEM'),'osPrivilege',rolname in('pg_execute_server_program','pg_read_server_files','pg_write_server_files')) order by rolname),'[]') from reachable),
 'unsafeLoginPrivilegePaths',(select coalesce(jsonb_agg(jsonb_build_object('actor',pg_get_userbyid(rr.actor),'role',r.rolname) order by rr.actor,r.oid),'[]') from role_reach rr join pg_roles r on r.oid=rr.roleid where r.rolsuper or has_parameter_privilege(r.oid,'session_replication_role','SET') or has_parameter_privilege(r.oid,'session_replication_role','ALTER SYSTEM') or r.rolname in('pg_execute_server_program','pg_read_server_files','pg_write_server_files')),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(member),'role',pg_get_userbyid(roleid),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option) order by member,roleid,grantor),'[]') from pg_auth_members),
 'operatorEntrants',(select coalesce(jsonb_agg(distinct r.rolname order by r.rolname),'[]') from role_reach rr join pg_roles r on r.oid=rr.actor where rr.roleid=(select oid from pg_roles where rolname=:'migration_role')),
 'defaults',(select coalesce(jsonb_agg(jsonb_build_object('database',setdatabase,'role',setrole,'setting',cfg) order by setdatabase,setrole,cfg),'[]') from pg_db_role_setting cross join lateral unnest(setconfig) cfg where setdatabase in(0,(select oid from pg_database where datname=current_database())) and split_part(cfg,'=',1)='session_replication_role'),
 'privilegedRoutines',(select coalesce(jsonb_agg(jsonb_build_object('identity',nspname||'.'||proname||'('||pg_get_function_identity_arguments(oid)||')','owner',pg_get_userbyid(proowner),'schemaAcl',nspacl::text,'acl',proacl::text,'definitionHash',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'config',proconfig) order by nspname,proname,oid),'[]') from privileged_functions),
 'authWriterRoutines',(select coalesce(jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','owner',pg_get_userbyid(p.proowner),'schemaAcl',n.nspacl::text,'definitionHash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'acl',p.proacl::text) order by n.nspname,p.proname,p.oid),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in('f','p') and p.prosecdef and (has_table_privilege(p.proowner,'auth.users','INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(p.proowner,'auth.users','INSERT,UPDATE')) and not(n.nspname='_byus_migration' and p.proname in('auth_guard','guard','storage_guard') and p.pronargs=0 and p.prorettype='trigger'::regtype) and exists(select from role_reach rr join pg_roles r on r.oid=rr.roleid where has_schema_privilege(r.oid,n.oid,'USAGE') and has_function_privilege(r.oid,p.oid,'EXECUTE'))),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,'definitionHash',encode(sha256(convert_to(pg_get_triggerdef(t.oid,true),'UTF8')),'hex'),'functionHash',encode(sha256(convert_to(pg_get_functiondef(t.tgfoid),'UTF8')),'hex'),'functionOwner',pg_get_userbyid(p.proowner)) order by t.tgname),'[]') from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='auth.users'::regclass and t.tgname<>'byus_auth_migration_guard')
);
`.replaceAll('__BYUS_TRUSTED_ROLES__',`ARRAY[${trustedRoles.map(literal).join(',')}]::text[]`);
 return source.run(sql);
}
export class DmsBudgetError extends Error {}
export function remainingBudget(c,state,{rollback=false,now=Date.now(),minimumMs=1000}={}){
 if(!state.fencedAt)return 15000;
 const remaining=(c.timeoutSeconds??300)*1000-(now-state.fencedAt);
 const allowance=remaining-(rollback?0:c.dms.rollbackReserveSeconds*1000);
 if(now<state.fencedAt||allowance<minimumMs)throw new DmsBudgetError(rollback?'DMS abort budget exhausted; fences remain closed':'DMS rollback reserve reached; guarded abort required');
 return Math.min(15000,allowance-100);
}
export function validateDmsConfig(c){
 const d=c.dms;
 if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['sourceRole','targetRole','replicationInstanceArn','sourceEndpointArn','targetEndpointArn','sourceCertificateArn','targetCertificateArn','manifestFile','manifestSha256','rollbackReserveSeconds','authFenceReviewFile','authFenceReviewSha256'].includes(k)))fail('Exact DMS configuration required');
 if(!c.localRehearsal&&c.source.projectRef!=='gmrykvmtmuaeswpajteq')fail('DMS source must be the reviewed production Supabase project');
 if(!c.localRehearsal&&(c.environment!=='prod'||c.accountId!=='996702758024'||c.profile!=='jewel-sallylab'))fail('DMS production scope must be explicit Sallylab prod');
 if(sorted(c.schemas)!=='["public"]')fail('DMS copy selects reviewed public tables only');
 for(const key of ['sourceRole','targetRole'])if(!/^[a-z][a-z0-9_]{2,62}$/.test(d[key]??'')||c.applicationRoles.includes(d[key])||[c.source.migrationRole,c.target.migrationRole].includes(d[key]))fail('DMS logins must be dedicated non-application non-operator roles');
 for(const [key,type] of [['replicationInstanceArn','rep'],['sourceEndpointArn','endpoint'],['targetEndpointArn','endpoint'],['sourceCertificateArn','cert'],['targetCertificateArn','cert']])if(!new RegExp(`^arn:aws:dms:${c.region}:${c.accountId}:${type}:[A-Za-z0-9_-]+$`).test(d[key]??''))fail('DMS resource ARN/account/region mismatch');
 if(d.sourceEndpointArn===d.targetEndpointArn)fail('DMS endpoints must differ');
 const reserve=d.rollbackReserveSeconds;
 if(!Number.isInteger(reserve)||reserve<(c.localRehearsal?1:30)||reserve*2>=(c.timeoutSeconds??300))fail('Explicit rollback reserve must leave a work window');
 if(!!d.manifestFile!==!!d.manifestSha256||(d.manifestSha256&&!/^[a-f0-9]{64}$/.test(d.manifestSha256)))fail('DMS manifest needs exact file SHA256');
 const tunnel=c.target.sqlTunnel;
 if(tunnel&&(!c.localRehearsal&&(tunnel.hostaddr!=='127.0.0.1'||!Number.isInteger(tunnel.port)||tunnel.port<1024||tunnel.port>65535||!/^i-[a-f0-9]+$/.test(tunnel.instanceId??'')||!tunnel.evidenceFile||!/^[a-f0-9]{64}$/.test(tunnel.evidenceSha256??''))))fail('Target SQL tunnel must be pinned loopback with SSM evidence');
 if(c.source.sqlTunnel)fail('Source must remain direct TLS IPv4');
 if(!!d.authFenceReviewFile!==!!d.authFenceReviewSha256||(d.authFenceReviewSha256&&!/^[a-f0-9]{64}$/.test(d.authFenceReviewSha256)))fail('Auth fence review requires exact file SHA256');
}
export function assertRoleIsolation(rows,applyRole,applicationRoles,{sealed=false}={}){
 const apply=rows.find(r=>r.name===applyRole);
 if(!apply||apply.superuser||apply.createrole||apply.ownsApp||apply.memberOperator||apply.memberships!==0||(sealed?(apply.login||apply.setReplica):(!apply.login||!apply.setReplica)))fail('DMS apply login privilege/state invalid');
 for(const name of applicationRoles){const r=rows.find(r=>r.name===name);if(!r||r.superuser||r.createrole||r.memberApply||r.inheritsApply||r.canSetApply||r.setReplica)fail('Application role can inherit/SET ROLE into DMS apply or bypass its fence');}
}
export function identityChanges(audit){return audit.tables.flatMap(t=>t.columns.filter(c=>c.identity==='a').map(c=>({schema:t.schema,table:t.name,column:c.name})));}
export function stageCatalog(audit,changes,mode){
 const a=structuredClone(audit);
 for(const change of changes){const column=a.tables.find(t=>t.schema===change.schema&&t.name===change.table)?.columns.find(c=>c.name===change.column);if(!column)fail('Identity manifest column missing');column.identity=mode;}
 a.catalogHash=catalogHash(a);return a;
}
const CHECKSUM_SETTINGS="set timezone='UTC';set datestyle='ISO,YMD';set intervalstyle='postgres';set bytea_output='hex';set extra_float_digits=3;";
function checksumQuery(t){
 if(!t.primaryKey.length)fail('Checksum needs primary key');
 const order=t.primaryKey.map(k=>{const c=t.columns.find(c=>c.name===k);return `${ident(k)}${/text|character/.test(c.type)?' collate "C"':''}`;}).join(',');
 // Only SHA256 row/chunk digests leave PostgreSQL; no customer field values.
 return `with ordered as(select row_number() over(order by ${order}) pos,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') digest from ${table(t)} t), chunks as(select (pos-1)/1000 chunk,count(*)::text rows,encode(sha256(convert_to(string_agg(digest,'' order by pos),'UTF8')),'hex') sha256 from ordered group by (pos-1)/1000) select coalesce(jsonb_agg(to_jsonb(chunks) order by chunk),'[]') from chunks`;
}
export function checksumSql(t){return `${CHECKSUM_SETTINGS}${checksumQuery(t)};`;}
export function checksumTablesSql(tables){
 if(!tables.length||new Set(tables.map(t=>`${t.schema}.${t.name}`)).size!==tables.length)fail('Checksum batch requires distinct tables');
 return `${CHECKSUM_SETTINGS}select jsonb_agg(to_jsonb(b) order by b.schema collate "C",b.name collate "C") from (${tables.map(t=>`select ${literal(t.schema)}::text as schema,${literal(t.name)}::text as name,(${checksumQuery(t)}) as chunks`).join(' union all ')}) b;`;
}
export function dmsTableMappings(audit){return {rules:[...audit.tables.map((t,i)=>({'rule-type':'selection','rule-id':String(i+1),'rule-name':String(i+1),'rule-action':'explicit','object-locator':{'schema-name':t.schema,'table-name':t.name}})),{'rule-type':'selection','rule-id':'900000','rule-name':'barrier','rule-action':'explicit','object-locator':{'schema-name':'_byus_barrier','table-name':'barriers'}},...audit.tables.flatMap(t=>t.columns.filter(c=>c.generated).map(c=>({'rule-type':'transformation','rule-id':String(910000+audit.tables.indexOf(t)*1000+t.columns.indexOf(c)),'rule-name':`generated${audit.tables.indexOf(t)}x${t.columns.indexOf(c)}`,'rule-target':'column','rule-action':'remove-column','object-locator':{'schema-name':t.schema,'table-name':t.name,'column-name':c.name}})))]};}
function endpointSnapshot(e){return {arn:e.EndpointArn,type:e.EndpointType,engine:e.EngineName,database:e.DatabaseName,ssl:e.SslMode,certificate:e.CertificateArn,eca:e.ExtraConnectionAttributes??'',settings:Object.fromEntries(Object.entries(e.PostgreSQLSettings??{}).filter(([key])=>!['Password','Username','ServerName','Port'].includes(key)))};}
export function storageShapeHash(inventory){if(!inventory)return null;const shape={...inventory};delete shape.projection;return hash(shape);}
export function validateFinalStorageReceipt(receipt,{c,state,source,target,sourceFenceVerified,now=Date.now(),admitting=true}){
 const observed=Date.parse(receipt.observedAt);
 if(!state.dmsStorageImportClosedAt||receipt.importsClosedAt!==state.dmsStorageImportClosedAt||observed<Date.parse(state.dmsStorageImportClosedAt))fail('Final storage imports must be closed before snapshot');
 if(!sourceFenceVerified||receipt.format!==1||receipt.engine!=='dms'||receipt.runId!==c.runId||receipt.accountId!==c.accountId||receipt.environment!==c.environment||receipt.fencedAt!==state.fencedAt||receipt.basePortReviewSha256!==c.portReviewSha256||receipt.sourceIdentityHash!==hash(source.identity)||receipt.targetIdentityHash!==hash(target.identity)||receipt.sourceCatalogHash!==state.catalogHash||receipt.targetCatalogHash!==state.targetCatalogHash||receipt.sourceGuardHash!==state.sourceGuardHash||receipt.storageInflightWriters!==0)fail('Final storage snapshot identity/fence/DDL binding differs');
 if(!Number.isFinite(observed)||observed<state.fencedAt||observed>now+5000||(admitting&&now-observed>60000))fail('Final storage snapshot receipt stale');
 if(receipt.sourceProjectionFingerprint!==hash(source.storageInventory.projection)||receipt.sourceProjectionFingerprint!==hash(target.storageInventory.projection)||receipt.targetInventoryFingerprint!==hash(target.storageInventory)||receipt.targetShapeHash!==state.dmsStorageShapeHash||storageShapeHash(target.storageInventory)!==state.dmsStorageShapeHash)fail('Final storage snapshot data/readonly shape differs');
 if(!Array.isArray(receipt.targetOnlyS3)||receipt.targetOnlyS3.length!==3||new Set(receipt.targetOnlyS3.map(r=>r.table)).size!==3||receipt.targetOnlyS3.some(r=>!STORAGE_IMPORT_TABLES.map(n=>'public.'+n).includes(r.table)||!/^[a-f0-9]{64}$/.test(r.sha256)||!/^\d+$/.test(String(r.rows))))fail('Exact supplemental S3 snapshot required');
 return receipt;
}
export function validateBlobEvidence(blob,receipt,expectedObjectIds){
 if(blob.format!==1||blob.runId!==receipt.runId||blob.fencedAt!==receipt.fencedAt||blob.sourceProjectionFingerprint!==receipt.sourceProjectionFingerprint||Date.parse(blob.observedAt)<receipt.fencedAt||!Array.isArray(blob.objects))fail('Final blob evidence binding differs');
 const observed=Date.parse(blob.observedAt);
 if(!Number.isFinite(observed)||observed<receipt.fencedAt||observed>Date.now()+5000)fail('Final blob evidence binding differs');
 const keys=blob.objects.map(o=>o.sourceObjectIdSha256);
 if(new Set(keys).size!==keys.length||sorted([...keys].sort())!==sorted([...expectedObjectIds].sort())||blob.objects.some(o=>!/^[a-f0-9]{64}$/.test(o.sourceSha256)||o.sourceSha256!==o.targetSha256||!Number.isSafeInteger(o.sourceBytes)||o.sourceBytes<0||o.sourceBytes!==o.targetBytes))fail('Actual final blob evidence does not match every source object');
}
export class DmsAdapter{
 constructor({c,source,target,state,aws,checkpoint=async()=>{}}){Object.assign(this,{c,source,target,state,callAws:aws,checkpoint});this.rollback=false;}
 bind(rollback=false){this.rollback=rollback;this.source.budget=this.target.budget=()=>remainingBudget(this.c,this.state,{rollback:this.rollback});}
 aws(args){return this.callAws(args,remainingBudget(this.c,this.state,{rollback:this.rollback}));}
 one(items,label){if(items?.length!==1)fail(`Expected one pinned DMS ${label}`);return items[0];}
 async roleCheck(sealed=false){
  const {c,target}=this,apply=c.dms.targetRole;
  const rows=target.run(`select jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,'createrole',r.rolcreaterole,'setReplica',has_parameter_privilege(r.oid,'session_replication_role','SET'),'memberApply',pg_has_role(r.oid,${literal(apply)},'MEMBER'),'inheritsApply',pg_has_role(r.oid,${literal(apply)},'USAGE'),'canSetApply',pg_has_role(r.oid,${literal(apply)},'SET'),'memberships',(select count(*) from pg_auth_members where member=r.oid),'memberOperator',pg_has_role(r.oid,${literal(c.target.migrationRole)},'MEMBER'),'ownsApp',exists(select from pg_class cl join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public' and cl.relkind in('r','p') and pg_has_role(r.oid,cl.relowner,'MEMBER')))) from pg_roles r where r.rolname in(${[...c.applicationRoles,apply].map(literal).join(',')});`);
  assertRoleIsolation(rows,apply,c.applicationRoles,{sealed});
 }
 async transport(){
  const d=this.c.dms;
  const instance=this.one(this.aws(['dms','describe-replication-instances','--filters',`Name=replication-instance-arn,Values=${d.replicationInstanceArn}`]).ReplicationInstances,'instance');
  if(instance.PubliclyAccessible!==false||instance.EngineVersion!=='3.6.1'||instance.ReplicationInstanceStatus!=='available')fail('DMS must be private available reviewed engine3.6.1');
  if(!this.c.localRehearsal&&(instance.ReplicationSubnetGroup?.VpcId!=='vpc-01e9e4c41c168ef70'||sorted(instance.ReplicationSubnetGroup.Subnets.map(x=>x.SubnetIdentifier).sort())!==sorted(['subnet-01747b4f8ffb85ded','subnet-0356be17ae6217f04'].sort())))fail('DMS instance must use reviewed production APP/NAT subnets');
  const endpoints={};
  for(const side of ['source','target']){
   const e=this.one(this.aws(['dms','describe-endpoints','--filters',`Name=endpoint-arn,Values=${d[side+'EndpointArn']}`]).Endpoints,side+' endpoint'),p=e.PostgreSQLSettings??{};
   if(e.EndpointArn!==d[side+'EndpointArn']||e.EndpointType?.toLowerCase()!==side||e.EngineName!=='postgres'||e.DatabaseName!==this.c[side].identity.database||e.SslMode!=='verify-full'||e.CertificateArn!==d[side+'CertificateArn']||!p.SecretsManagerSecretId||!p.SecretsManagerAccessRoleArn)fail('DMS endpoint identity/TLS/secret binding differs');
   if(side==='source'&&(p.CaptureDdls!==false||p.PluginName?.replaceAll('-','_')!=='test_decoding'||p.FailTasksOnLobTruncation!==true||p.AfterConnectScript||p.HeartbeatEnable===true||p.SlotName))fail('Source DMS capture/LOB policies differ');
   if(side==='target'&&(p.AfterConnectScript!=='SET session_replication_role=replica'||!/(?:^|;)loadUsingCSV=false(?:;|$)/i.test(e.ExtraConnectionAttributes??'')))fail('Target DMS apply mode differs');
   if(!this.c.localRehearsal&&(!new RegExp(`^arn:aws:secretsmanager:${this.c.region}:${this.c.accountId}:secret:byus/prod/dms-copy/${side}-`).test(p.SecretsManagerSecretId)||p.SecretsManagerAccessRoleArn!==`arn:aws:iam::${this.c.accountId}:role/byus-prod-dms-copy-${side}-secret-role`))fail('DMS must use exact dedicated production copy secret/role paths');
   const response=this.aws(['secretsmanager','get-secret-value','--secret-id',p.SecretsManagerSecretId]);let secret;try{secret=JSON.parse(response.SecretString);}catch{fail('DMS secret JSON invalid');}
   if(!secret||Object.keys(secret).some(k=>!['host','port','username','password'].includes(k))||secret.host!==this.c[side].host||Number(secret.port)!==this.c[side].identity.serverPort||secret.username!==d[side+'Role']||typeof secret.password!=='string'||!secret.password)fail('DMS secret endpoint/login binding differs');
   endpoints[side]={...endpointSnapshot(e),secretVersion:response.VersionId??null};
  }
  return {instanceArn:d.replicationInstanceArn,version:instance.EngineVersion,network:instance.ReplicationSubnetGroup??null,securityGroups:instance.VpcSecurityGroups??null,endpoints};
 }
 async draft(source,target){
  await this.roleCheck(false);
  const findings={textPk:[],compositePk:[],unboundedNumeric:[]};
  for(const t of source.tables){if(t.primaryKey.length>1)findings.compositePk.push(`${t.schema}.${t.name}`);for(const col of t.columns){if(t.primaryKey.includes(col.name)&&col.type==='text')findings.textPk.push(`${t.schema}.${t.name}.${col.name}`);if(col.type==='numeric')findings.unboundedNumeric.push(`${t.schema}.${t.name}.${col.name}`);}}
  return {format:1,engine:'dms',runId:this.c.runId,sourceIdentityHash:hash(source.identity),targetIdentityHash:hash(target.identity),sourceCatalogHash:source.catalogHash,targetCatalogHash:target.catalogHash,transportHash:hash(await this.transport()),tables:source.tables.map(t=>({schema:t.schema,name:t.name,sourceFingerprint:objectFingerprints(source)[`tables:${t.schema}.${t.name}`],targetFingerprint:objectFingerprints(target)[`tables:${t.schema}.${t.name}`]})),identities:identityChanges(target).filter(i=>source.tables.some(t=>t.schema===i.schema&&t.name===i.table)),generated:source.tables.flatMap(t=>t.columns.filter(c=>c.generated).map(c=>({schema:t.schema,table:t.name,column:c.name}))),findings,fixtureEvidenceSha256:null,evidence:[]};
 }
 async load(source,target){
  const d=this.c.dms;if(!d.manifestFile||!d.manifestSha256)fail('Reviewed DMS manifest required');
  const body=await readFile(resolve(d.manifestFile),'utf8');if(hash(body)!==d.manifestSha256)fail('DMS manifest hash changed');const m=JSON.parse(body);
  for(const key of ['format','engine','runId','sourceIdentityHash','targetIdentityHash','sourceCatalogHash','targetCatalogHash','transportHash','tables','identities','generated','findings'])if(sorted(m[key])!==sorted((await this.draftCached(source,target))[key]))fail(`DMS reviewed manifest differs: ${key}`);
  if(!Array.isArray(m.evidence)||!m.evidence.length)fail('DMS fixture evidence required');let fixture;
  for(const e of m.evidence){const text=await readFile(resolve(dirname(d.manifestFile),e.path),'utf8');if(hash(text)!==e.sha256)fail('DMS evidence hash changed');if(e.sha256===m.fixtureEvidenceSha256)fixture=JSON.parse(text);}
  if(!fixture?.syntheticOnly||fixture.customerDataReadOrReplicated!==false||!fixture.initialExactValues||!fixture.cdcExactValues||!fixture.oversize2097152BytesRejectedAt1048576Limit||!fixture.targetUnchangedAfterRejectedOversize||!fixture.identityRestoredToAlways)fail('Exact DMS synthetic fixture proof required');
  if((m.findings.textPk.length&&!fixture.textPrimaryKey)||(m.findings.compositePk.length&&!fixture.compositePrimaryKey)||!fixture.deletePreserved)fail('Actual source text/composite PK and DELETE need matching fixture evidence');
  return m;
 }
 async draftCached(s,t){if(!this._draft)this._draft=await this.draft(s,t);return this._draft;}
 async preflight(source,target){
  for(const t of source.tables){if(t.kind!=='r'||t.partition||t.persistence!=='p'||!t.primaryKey.length||t.replicaIdentity!=='d')fail('DMS requires regular logged PK tables with DEFAULT replica identity');
   const cols=t.columns.filter(c=>['text','json','jsonb','bytea','xml'].includes(c.type)||c.type.endsWith('[]')||/character/.test(c.type));
   if(cols.length){const expressions=cols.map(c=>c.type==='bytea'?`octet_length(${ident(c.name)})`:`greatest(octet_length(${ident(c.name)}::text),length(${ident(c.name)}::text)*4)`);if(this.source.run(`select coalesce(max(greatest(${expressions.join(',')})),0)>1048576 from ${table(t)};`,{json:false})==='t')fail(`Source LOB exceeds conservative fixture bound: ${t.schema}.${t.name}`);}
  }
  const role=this.source.run(`select jsonb_build_object('replication',rolreplication,'superuser',rolsuper,'login',rolcanlogin,'bypassRls',rolbypassrls,'createrole',rolcreaterole,'canSetOperator',pg_has_role(oid,${literal(this.c.source.migrationRole)},'SET')) from pg_roles where rolname=${literal(this.c.dms.sourceRole)};`);if(!role?.replication||role.superuser||!role.login||role.createrole||role.canSetOperator||(source.tables.some(t=>t.rls)&&!role.bypassRls))fail('Source DMS needs dedicated non-super replication login');
  const access=this.source.run(`select to_json(bool_and(has_table_privilege(${literal(this.c.dms.sourceRole)},c.oid,'SELECT'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';`);if(access!==true)fail('Source DMS login lacks selected table SELECT');
  const m=await this.load(source,target);this.state.dmsStorageShapeHash=storageShapeHash(target.storageInventory);this.state.dmsManifestHash=this.c.dms.manifestSha256;this.state.dmsTransportHash=m.transportHash;this.state.dmsIdentities=m.identities;
  this.state.dmsIdentityImport=IDENTITY_IMPORT_TABLES.every(name=>target.tables.some(t=>t.schema==='public'&&t.name===name));
  if(this.state.dmsIdentityImport){identityRoleCheck(this.c,this.target,false);await this.authSafety();}
  if(this.state.dmsStorageShapeHash)await this.storageImportRoleCheck(false);
 }
 taskId(){return `byus-copy-${this.c.runId.replace(/_+/g,'-').replace(/-$/,'')}`;}
 async settings(){return JSON.parse(await readFile(join(FILES,'task-settings.json'),'utf8'));}
 async task(){
  const tasks=this.aws(['dms','describe-replication-tasks']).ReplicationTasks??[];
  const t=this.one(tasks.filter(t=>t.ReplicationTaskArn===this.state.dmsTaskArn),'task');
  if(t.ReplicationTaskIdentifier!==this.taskId()||t.ReplicationInstanceArn!==this.c.dms.replicationInstanceArn||t.SourceEndpointArn!==this.c.dms.sourceEndpointArn||t.TargetEndpointArn!==this.c.dms.targetEndpointArn||t.MigrationType!=='full-load-and-cdc'||sorted(JSON.parse(t.TableMappings))!==sorted(this.state.dmsMappings))fail('DMS task binding/mapping changed');
  const actual=JSON.parse(t.ReplicationTaskSettings),wanted=await this.settings();for(const [section,v] of Object.entries(wanted))for(const [key,value] of Object.entries(v))if(sorted(actual[section]?.[key])!==sorted(value))fail('DMS task safety settings changed');return t;
 }
 async initialReady(){
  if(hash(await this.transport())!==this.state.dmsTransportHash)fail('DMS endpoint or instance binding changed');await this.roleCheck(false);
  const t=await this.task();if(t.Status!=='running'||t.ReplicationTaskStats?.FullLoadProgressPercent!==100||t.ReplicationTaskStats.TablesErrored!==0||t.ReplicationTaskStats.TablesLoading!==0||t.ReplicationTaskStats.TablesQueued!==0)fail('DMS initial copy not ready');
  const rows=this.aws(['dms','describe-table-statistics','--replication-task-arn',t.ReplicationTaskArn]).TableStatistics??[];
  const selected=this.state.dmsMappings.rules.filter(r=>r['rule-type']==='selection');if(rows.length!==selected.length||selected.some(r=>!rows.some(t=>t.SchemaName===r['object-locator']['schema-name']&&t.TableName===r['object-locator']['table-name']&&t.TableState==='Table completed')))fail('DMS table full-load coverage incomplete');
 }
 async authSafety(){
  if(!this.state.dmsIdentityImport)return;
  const d=this.c.dms;if(!d.authFenceReviewFile||!d.authFenceReviewSha256)fail('Pinned source auth fence review required');
  const text=await readFile(resolve(d.authFenceReviewFile),'utf8');if(hash(text)!==d.authFenceReviewSha256)fail('Source auth fence review changed');const review=JSON.parse(text);
  if(review.format!==1||review.runId!==this.c.runId||review.sourceIdentityHash!==hash(this.source.identity())||!review.reason||review.operatorDdlFreezeRole!==this.c.source.migrationRole||!Array.isArray(review.ddlFreezeRoles)||review.ddlFreezeRoles.length!==1||review.ddlFreezeRoles.includes(this.c.source.migrationRole)||(!this.c.localRehearsal&&sorted(review.ddlFreezeRoles)!=='["supabase_admin"]'))fail('Source auth fence review identity/DDL actor differs');
  const r=await authSafetyInventory(this.c,this.source,review.ddlFreezeRoles);
  if(!Array.isArray(review.operatorAliases)||review.operatorAliases.some(a=>typeof a!=='string'||a===this.c.source.migrationRole||review.ddlFreezeRoles.includes(a))||(!this.c.localRehearsal&&review.operatorAliases.some(a=>a!=='cli_login_postgres'))||sorted(r.operatorEntrants)!==sorted([this.c.source.migrationRole,...review.operatorAliases].sort()))fail('Auth operator SET/ADMIN alias graph differs');
  if(!r.requiredRolesPresent||!r.trustedRolesPresent||r.owner!==review.authOwner||!r.regular||r.inheritance!==0||r.rules!==0||r.subscriptions!==0||!r.canTrigger||!r.canInspectWriterSessions||r.currentReplicaMode!=='origin'||r.defaults.some(d=>d.setting!=='session_replication_role=origin')||r.unsafeLoginPrivilegePaths.length!==0||r.reachableRoles.some(r=>r.superuser||r.setReplica||r.alterSystemReplica||r.osPrivilege)||hash(r)!==review.inventorySha256)fail('Source auth ORIGIN fence privilege/default/catalog review differs');
  if(!this.c.localRehearsal&&r.owner!=='supabase_auth_admin')fail('Source auth owner differs from managed Auth');
  if(this.state.dmsAuthSafetyHash&&this.state.dmsAuthSafetyHash!==hash(r))fail('Source auth safety catalog changed');
  this.authOperatorAliases=review.operatorAliases;return r;
 }
 async prepareAuth(){
  if(!this.state.dmsIdentityImport)return;
  const safety=await this.authSafety();
  if(this.source.run("select to_regclass('_byus_migration.auth_fence') is not null;",{json:false})==='t'&&this.source.run('select coalesce(bool_or(fenced),false)::text from _byus_migration.auth_fence;',{json:false})==='true')fail('Existing source auth.users fence active');
  if(this.source.run("select count(*)::int from pg_trigger where tgrelid='auth.users'::regclass and tgname='byus_auth_migration_guard';")!==0)fail('Existing auth migration trigger requires inspection');
  this.source.run(`begin;${await readFile(join(FILES,'identity-auth-guard.sql'),'utf8')}
   insert into _byus_migration.auth_fence values(true,${literal(this.c.runId)},false) on conflict(singleton) do update set run_id=excluded.run_id where not _byus_migration.auth_fence.fenced;
   create trigger byus_auth_migration_guard before insert or update or delete or truncate on auth.users for each statement execute function _byus_migration.auth_guard();commit;`,{json:false});
  this.state.dmsAuthSafetyHash=hash(safety);this.state.dmsAuthReviewHash=this.c.dms.authFenceReviewSha256;
  this.state.dmsAuthGuardHash=this.source.run("select md5(pg_get_functiondef('_byus_migration.auth_guard()'::regprocedure));",{json:false});
  this.state.dmsAuthTriggerHash=this.source.run("select md5(pg_get_triggerdef(oid,true)) from pg_trigger where tgrelid='auth.users'::regclass and tgname='byus_auth_migration_guard';",{json:false});
  await this.authTriggers(false);
 }
 async drainAuthWriters(){
  if(!this.state.dmsIdentityImport)return;
  const safety=await this.authSafety(),actors=safety.actors.map(literal).join(',');
  const old=this.source.run(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'started',backend_start) order by pid),'[]') from pg_stat_activity where datname=current_database() and backend_type='client backend' and usename in(${actors}) and pid<>pg_backend_pid();`);
  if(old.some(s=>!Number.isInteger(s.pid)||!Number.isFinite(Date.parse(s.started))))fail('Auth writer session metadata is not inspectable');
  for(const session of old){const ok=this.source.run(`select to_json(coalesce((select pg_terminate_backend(pid) from pg_stat_activity where pid=${Number(session.pid)} and backend_start=${literal(session.started)}::timestamptz),true));`);if(ok!==true)fail('Old auth writer session could not be drained');}
  while(old.length&&this.source.run(`select count(*)::int from pg_stat_activity where ${old.map(s=>`(pid=${Number(s.pid)} and backend_start=${literal(s.started)}::timestamptz)`).join(' or ')};`)!==0){remainingBudget(this.c,this.state);await new Promise(r=>setTimeout(r,50));}
  if(this.source.run("select current_setting('session_replication_role');",{json:false})!=='origin')fail('Fresh operator session is not origin');
  let denied=false;try{this.source.run('set session_replication_role=replica;',{json:false});}catch(error){if(!/SQLSTATE 42501/.test(error.message))throw error;denied=true;}if(!denied)fail('Fresh operator can set replica mode');
  this.state.dmsAuthSessionProof={drainedAt:new Date().toISOString(),oldSessionCount:old.length,oldSessionFingerprint:hash(old),safetyHash:hash(safety),operatorOrigin:true,operatorReplicaSetDenied:true,authWriterReplicaProof:'postgresql-role-acl-and-defaults'};
  await this.checkpoint({authWriterDrain:this.state.dmsAuthSessionProof});
 }
 async authTriggers(fenced=true){
  if(!this.state.dmsIdentityImport)return true;
  const safety=await this.authSafety(),roles=safety.reachableRoles.filter(r=>![this.c.source.migrationRole,...this.authOperatorAliases].includes(r.name)).map(r=>literal(r.name)).join(',')||"''";
  const r=this.source.run(`select jsonb_build_object('run',(select run_id from _byus_migration.auth_fence where singleton),'fenced',(select fenced from _byus_migration.auth_fence where singleton),'functionHash',md5(pg_get_functiondef('_byus_migration.auth_guard()'::regprocedure)),
   'triggerHash',(select md5(pg_get_triggerdef(oid,true)) from pg_trigger where tgrelid='auth.users'::regclass and tgname='byus_auth_migration_guard'),
   'guards',(select count(*) from pg_trigger where tgrelid='auth.users'::regclass and tgname='byus_auth_migration_guard' and tgfoid='_byus_migration.auth_guard()'::regprocedure and tgenabled='O' and tgtype=62 and tgqual is null and tgnargs=0),
   'owners',(select bool_and(owner=${literal(this.c.source.migrationRole)}) from(select pg_get_userbyid(relowner) owner from pg_class where oid='_byus_migration.auth_fence'::regclass union all select pg_get_userbyid(proowner) from pg_proc where oid='_byus_migration.auth_guard()'::regprocedure union all select pg_get_userbyid(nspowner) from pg_namespace where nspname='_byus_migration') q),
   'unsafeControl',exists(select from pg_roles where rolname in(${roles}) and (has_table_privilege(oid,'_byus_migration.auth_fence','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') or has_schema_privilege(oid,'_byus_migration','CREATE') or pg_has_role(oid,${literal(this.c.source.migrationRole)},'USAGE') or pg_has_role(oid,${literal(this.c.source.migrationRole)},'SET'))));`);
  const proof=this.state.dmsAuthSessionProof;
  if(r.run!==this.c.runId||r.fenced!==fenced||r.functionHash!==this.state.dmsAuthGuardHash||r.triggerHash!==this.state.dmsAuthTriggerHash||r.guards!==1||r.owners!==true||r.unsafeControl||(fenced&&(!proof||proof.safetyHash!==hash(safety)||!proof.operatorOrigin||!proof.operatorReplicaSetDenied||Date.parse(proof.drainedAt)<this.state.fencedAt)))fail('Source auth ORIGIN fence/control/drain changed');return true;
 }
 async verifyIdentityReceipt(source,target){
  if(!this.state.dmsIdentityImport)return;
  await this.authTriggers(true);await this.storageImportSealed();
  const binding=this.state.dmsFinalIdentityReceipt??this.state.dmsIdentityImportCompleted;if(!binding)fail('Sealed identity receipt required');
  const text=await readFile(binding.path,'utf8');if(hash(text)!==binding.sha256)fail('Identity receipt changed');
  const r=validateIdentityReceipt(JSON.parse(text),{c:this.c,state:this.state,source,target});
  if(sorted(await identityTableProof(this.target))!==sorted(r.tables))fail('Identity canonical digest changed after seal');
  const snapshot=readIdentitySnapshot(this.source);
  if(hash(snapshot.owners)!==r.sourceOwnersHash||hash(snapshot.credentials)!==r.credentialHash||hash(snapshot.bindings)!==r.bindingsHash)fail('Identity source snapshot changed after seal');
 }
 async storageSafety(){
  const actors=['supabase_storage_admin','authenticator','service_role',this.c.source.migrationRole];
  const result=this.source.run(`with actors as(select oid from pg_roles where rolname in(${actors.map(literal).join(',')})), reachable as(select distinct r.oid from actors a cross join pg_roles r where pg_has_role(a.oid,r.oid,'USAGE') or pg_has_role(a.oid,r.oid,'SET')) select jsonb_build_object('actorCount',(select count(*) from actors),'subscribers',(select count(*) from pg_subscription where subdbid=(select oid from pg_database where datname=current_database())), 'unsafe',exists(select from pg_roles r join reachable x on x.oid=r.oid where r.rolsuper or has_parameter_privilege(r.oid,'session_replication_role','SET')),'defaults',exists(select from pg_db_role_setting d cross join lateral unnest(d.setconfig) cfg where d.setdatabase in(0,(select oid from pg_database where datname=current_database())) and (d.setrole=0 or d.setrole in(select oid from reachable)) and split_part(cfg,'=',1)='session_replication_role' and split_part(cfg,'=',2)<>'origin'),'definers',exists(select from pg_proc p where p.prosecdef and (coalesce(p.proconfig::text,'') like '%session_replication_role%' or p.prosrc ilike '%session_replication_role%') and exists(select from reachable r where has_function_privilege(r.oid,p.oid,'EXECUTE'))),'triggerPrivilege',(select count(*)=2 and bool_and(has_table_privilege(current_user,c.oid,'TRIGGER')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname in('buckets','objects')));`);
  if(result.actorCount!==new Set(actors).size||result.subscribers!==0||result.unsafe||result.defaults||result.definers||result.triggerPrivilege!==true)fail('Storage NORMAL fence unsupported: replication-role closure/subscriber/TRIGGER privilege gate');
 }
 async prepareStorage(){
  if(!this.state.dmsStorageShapeHash)return;
  await this.storageSafety();
  if(this.source.run("select to_regclass('_byus_migration.storage_fence') is not null;",{json:false})==='t'&&this.source.run('select coalesce(bool_or(fenced),false)::text from _byus_migration.storage_fence;',{json:false})==='true')fail('Existing source storage fence active');
  this.source.run(await readFile(join(FILES,'storage-guard.sql'),'utf8'),{json:false});
  this.source.run(`insert into _byus_migration.storage_fence values(true,${literal(this.c.runId)},false) on conflict(singleton) do update set run_id=excluded.run_id where not _byus_migration.storage_fence.fenced;`,{json:false});
  if(this.source.run('select run_id from _byus_migration.storage_fence where singleton;',{json:false})!==this.c.runId)fail('Another source storage fence is active');
  for(const name of ['buckets','objects'])for(const [suffix,event,level] of [['rows','insert or update or delete','row'],['truncate','truncate','statement']]){
   const trigger=`byus_storage_migration_${suffix}_guard`;
   const found=this.source.run(`select count(*)::int from pg_trigger where tgrelid='storage.${name}'::regclass and tgname=${literal(trigger)};`);
   if(!found)this.source.run(`create trigger ${ident(trigger)} before ${event} on storage.${ident(name)} for each ${level} execute function _byus_migration.storage_guard();`,{json:false});
  }
  this.state.dmsStorageGuardHash=this.source.run("select md5(pg_get_functiondef('_byus_migration.storage_guard()'::regprocedure));",{json:false});
  await this.storageTriggers(false);
 }
 async storageTriggers(requireFenced=true){
  if(!this.state.dmsStorageShapeHash)return true;
  await this.storageSafety();
  const status=this.source.run(`select jsonb_build_object('run',(select run_id from _byus_migration.storage_fence where singleton),'fenced',(select fenced from _byus_migration.storage_fence where singleton),'functionHash',md5(pg_get_functiondef('_byus_migration.storage_guard()'::regprocedure)),'guards',(select count(*) from pg_trigger tr join pg_class cl on cl.oid=tr.tgrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='storage' and cl.relname in('buckets','objects') and tr.tgfoid='_byus_migration.storage_guard()'::regprocedure and tr.tgenabled='O' and ((tr.tgname='byus_storage_migration_rows_guard' and tr.tgtype=31) or(tr.tgname='byus_storage_migration_truncate_guard' and tr.tgtype=34))));`);
  if(status.run!==this.c.runId||status.functionHash!==this.state.dmsStorageGuardHash||status.guards!==4||(requireFenced&&status.fenced!==true))fail('Source storage fence proof missing/changed');return true;
 }
 async fenceSql(sql){
  // Close Auth leases before taking public-table DDL locks.
  if(this.state.dmsIdentityImport){await this.authTriggers(false);await this.drainAuthWriters();sql=sql.replace(/^begin;/i,`begin;update _byus_migration.auth_fence set fenced=true where singleton and run_id=${literal(this.c.runId)};`);}
  if(!this.state.dmsStorageShapeHash)return sql;
  await this.storageTriggers(false);
  return sql.replace(/commit;\s*$/i,`update _byus_migration.storage_fence set fenced=true where singleton and run_id=${literal(this.c.runId)};commit;`);
 }
 storageUnfenceSql(){return (this.state.dmsStorageShapeHash?`update _byus_migration.storage_fence set fenced=false where singleton and run_id=${literal(this.c.runId)};`:'')+(this.state.dmsIdentityImport?`update _byus_migration.auth_fence set fenced=false where singleton and run_id=${literal(this.c.runId)};`:'');}
 async storageImportRoleCheck(sealed){
  const role=literal(STORAGE_IMPORT_ROLE),tables=STORAGE_IMPORT_TABLES.map(literal).join(',');
  const result=this.target.run(`with importer as(select * from pg_roles where rolname=${role}), reachable as(select r.* from importer i cross join pg_roles r where pg_has_role(i.oid,r.oid,'USAGE') or pg_has_role(i.oid,r.oid,'SET')) select jsonb_build_object(
   'sessions',(select count(*) from pg_stat_activity where usename=${role} and datname=current_database()),
   'login',(select rolcanlogin from importer),'bypass',(select rolbypassrls from importer),
   'unsafe',exists(select from reachable where rolsuper or rolcreaterole or rolreplication or has_parameter_privilege(oid,'session_replication_role','SET') or rolname in(${literal(this.c.target.migrationRole)},${literal(this.c.dms.targetRole)})),
   'appCount',(select count(*) from pg_roles where rolname in(${this.c.applicationRoles.map(literal).join(',')})),
   'appAccess',exists(select from pg_roles where rolname in(${this.c.applicationRoles.map(literal).join(',')}) and (pg_has_role(oid,${role},'MEMBER') or pg_has_role(oid,${role},'USAGE') or pg_has_role(oid,${role},'SET'))),
   'ownsApp',exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and pg_has_role(${role},c.relowner,'MEMBER')),
   'schemaCreate',has_schema_privilege(${role},'public','CREATE'),
   'otherWrites',exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relname not in(${tables}) and has_table_privilege(${role},c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')),
   'exactAccess',(select count(*)=12 and bool_and(has_table_privilege(${role},c.oid,p.privilege)) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p(privilege) where n.nspname='public' and c.relname in(${tables}) and c.relkind='r'));
  `);
  if((sealed&&result.sessions!==0)||result.login!==!sealed||result.bypass!==true||result.unsafe||result.appCount!==new Set(this.c.applicationRoles).size||result.appAccess||result.ownsApp||result.schemaCreate||result.otherWrites||result.exactAccess!==true)fail('Storage import login privilege/state invalid');
 }
 async sealStorageImport(){
  if(!this.state.dmsStorageShapeHash&&!this.state.dmsIdentityImport)return;
  const closed=this.target.run(`update _byus_migration.state set imports_open=false,imports_closed_at=coalesce(imports_closed_at,clock_timestamp()) where run_id=${literal(this.c.runId)} and side='target' and fenced and first_write_at is null returning to_json(imports_closed_at);`);
  if(!Number.isFinite(Date.parse(closed)))fail('Storage import fence could not be closed');
  if(this.state.dmsIdentityImport){
   this.target.run(`alter role ${ident(IDENTITY_IMPORT_ROLE)} nologin;`,{json:false});
   this.target.run(`select coalesce(jsonb_agg(pg_terminate_backend(pid)),'[]') from pg_stat_activity where usename=${literal(IDENTITY_IMPORT_ROLE)} and datname=current_database() and pid<>pg_backend_pid();`);
   while(this.target.run(`select count(*)::int from pg_stat_activity where usename=${literal(IDENTITY_IMPORT_ROLE)} and datname=current_database();`)!==0){remainingBudget(this.c,this.state,{rollback:this.rollback});await new Promise(r=>setTimeout(r,100));}
   identityRoleCheck(this.c,this.target,true);
  }
  if(this.state.dmsStorageShapeHash){
  this.target.run(`alter role ${ident(STORAGE_IMPORT_ROLE)} nologin;`,{json:false});
  this.target.run(`select coalesce(jsonb_agg(pg_terminate_backend(pid)),'[]') from pg_stat_activity where usename=${literal(STORAGE_IMPORT_ROLE)} and datname=current_database() and pid<>pg_backend_pid();`);
  while(this.target.run(`select count(*)::int from pg_stat_activity where usename=${literal(STORAGE_IMPORT_ROLE)} and datname=current_database();`)!==0){remainingBudget(this.c,this.state,{rollback:this.rollback});await new Promise(r=>setTimeout(r,100));}
  await this.storageImportRoleCheck(true);
  }
  this.state.dmsStorageImportClosedAt=closed;await this.checkpoint({storageImportsClosedAt:closed});
 }
 async storageImportSealed(){
  if(!this.state.dmsStorageShapeHash&&!this.state.dmsIdentityImport)return;
  const status=this.target.run(`select jsonb_build_object('open',imports_open,'closedAt',imports_closed_at,'fenced',fenced,'firstWriteAt',first_write_at) from _byus_migration.state where run_id=${literal(this.c.runId)} and side='target';`);
  if(status.open!==false||status.closedAt!==this.state.dmsStorageImportClosedAt||status.fenced!==true||status.firstWriteAt)fail('Storage import fence changed after barrier');
  if(this.state.dmsStorageShapeHash)await this.storageImportRoleCheck(true);
  if(this.state.dmsIdentityImport)identityRoleCheck(this.c,this.target,true);
 }
 async refreshStorageProjection(){
  if(!this.state.dmsStorageShapeHash)return;
  await this.storageImportSealed();
  const sourceFenceVerified=await this.storageTriggers(true);
  const projection=await refreshLegacyStorageProjection(this.source,this.target,{expectedShapeHash:this.state.dmsStorageShapeHash,sourceFenceVerified,importsClosed:true});
  this.state.dmsFinalStorageProjection=projection;await this.checkpoint({storageProjection:projection});
 }
 async prepare(source,target){
  await this.preflight(source,target);
  await this.prepareAuth();
  await this.prepareStorage();
  this.state.dmsCopyCatalogHash=catalogHash(stageCatalog(target,this.state.dmsIdentities,'d'));
  this.target.run(this.state.dmsIdentities.map(i=>`alter table ${ident(i.schema)}.${ident(i.table)} alter column ${ident(i.column)} set generated by default;`).join('\n')||'select 1;',{json:false});
  const barrier="create schema _byus_barrier;create table _byus_barrier.barriers(id uuid primary key,source_commit_fence_lsn text);revoke all on schema _byus_barrier from public;";
  this.source.run(`begin;${barrier}grant usage on schema _byus_barrier to ${ident(this.c.dms.sourceRole)};grant select on _byus_barrier.barriers to ${ident(this.c.dms.sourceRole)};commit;`,{json:false});
  this.prepareTargetBarriers(barrier);
  this.target.run('create table _byus_migration.dms_proofs(run_id text primary key,proof_hash text not null,verified_at timestamptz not null);revoke all on _byus_migration.dms_proofs from public;',{json:false});
  const connections=this.aws(['dms','describe-connections']).Connections??[];for(const arn of [this.c.dms.sourceEndpointArn,this.c.dms.targetEndpointArn])if(!connections.some(x=>x.ReplicationInstanceArn===this.c.dms.replicationInstanceArn&&x.EndpointArn===arn&&x.Status==='successful'))fail('Both DMS verify-full connection tests required');
  this.state.dmsMappings=dmsTableMappings(source);
  if((this.aws(['dms','describe-replication-tasks']).ReplicationTasks??[]).some(t=>t.ReplicationTaskIdentifier===this.taskId()))fail('DMS task name already exists');
  const input={ReplicationTaskIdentifier:this.taskId(),SourceEndpointArn:this.c.dms.sourceEndpointArn,TargetEndpointArn:this.c.dms.targetEndpointArn,ReplicationInstanceArn:this.c.dms.replicationInstanceArn,MigrationType:'full-load-and-cdc',TableMappings:JSON.stringify(this.state.dmsMappings),ReplicationTaskSettings:JSON.stringify(await this.settings())};
  this.state.dmsTaskArn=this.aws(['dms','create-replication-task','--cli-input-json',JSON.stringify(input)]).ReplicationTask.ReplicationTaskArn;
  await this.checkpoint({dmsTaskArn:this.state.dmsTaskArn});
  // Async creation: a subsequent prepare-resume is deliberately not automatic.
  const readyDeadline=Date.now()+120000;while((await this.task()).Status==='creating'){if(Date.now()>readyDeadline)fail('DMS task creation timed out; inspect preparation ledger');await new Promise(r=>setTimeout(r,500));}
  if((await this.task()).Status!=='ready')fail('DMS task did not become ready');
  this.aws(['dms','start-replication-task','--replication-task-arn',this.state.dmsTaskArn,'--start-replication-task-type','start-replication']);
 }
 prepareTargetBarriers(barrier){
  const role=ident(this.c.dms.targetRole),operator=ident(this.c.target.migrationRole);
  const access=this.target.run(`select jsonb_build_object('canSet',pg_has_role(current_user,${literal(this.c.dms.targetRole)},'SET'),'member',pg_has_role(current_user,${literal(this.c.dms.targetRole)},'MEMBER'));`);
  if(!access.canSet&&access.member)fail('Inspect existing operator membership before granting DMS schema ownership');
  // RDS operators need temporary SET permission to create a schema for the isolated apply role.
  this.target.run(`begin;${access.canSet?'':`grant ${role} to ${operator} with inherit false,set true;`}${barrier}grant usage on schema _byus_barrier to ${role};grant insert,update,delete,select on _byus_barrier.barriers to ${role};create schema _byus_dms_control authorization ${role};revoke all on schema _byus_dms_control from public;${access.canSet?'':`revoke ${role} from ${operator};`}commit;`,{json:false});
 }
 async seal(){
  if(!this.state.dmsTaskArn)return;
  let task=await this.task();
  if(['running','starting'].includes(task.Status)){this.state.dmsStopRequested=true;await this.checkpoint({dmsStopRequested:true});this.aws(['dms','stop-replication-task','--replication-task-arn',task.ReplicationTaskArn]);}
  while(['running','starting','stopping'].includes(task.Status)){remainingBudget(this.c,this.state,{rollback:this.rollback});await new Promise(r=>setTimeout(r,500));task=await this.task();}
  if(!['stopped','failed','ready'].includes(task.Status))fail('DMS cannot confirm stopped transport');
  if(!this.rollback&&task.Status!=='stopped')fail('Failed/unstarted DMS task cannot prove copy');
  const role=this.c.dms.targetRole;
  this.target.run(`begin;alter role ${ident(role)} nologin;revoke set on parameter session_replication_role from ${ident(role)};commit;`,{json:false});
  this.target.run(`select coalesce(jsonb_agg(pg_terminate_backend(pid)),'[]') from pg_stat_activity where usename=${literal(role)} and datname=current_database() and pid<>pg_backend_pid();`);
  while(this.target.run(`select count(*)::int from pg_stat_activity where usename=${literal(role)} and datname=current_database();`)!==0){remainingBudget(this.c,this.state,{rollback:this.rollback});await new Promise(r=>setTimeout(r,100));}
  await this.roleCheck(true);this.state.dmsSealed=true;await this.checkpoint({dmsApplySealed:true});
 }
 async verify(sourceAudit,targetAudit){
  const manifestText=await readFile(resolve(this.c.dms.manifestFile),'utf8');if(hash(manifestText)!==this.state.dmsManifestHash)fail('DMS manifest changed after prepare');
  if(!this.state.barrierId||!this.state.sourceCommitFenceLsn)fail('DMS committed barrier missing');
  if(!this.state.dmsSealed){
   await this.initialReady();
   while(true){const row=this.target.run(`select coalesce((select jsonb_build_object('lsn',source_commit_fence_lsn) from _byus_barrier.barriers where id=${literal(this.state.barrierId)}::uuid),'{}');`);if(row.lsn===this.state.sourceCommitFenceLsn)break;remainingBudget(this.c,this.state);await new Promise(r=>setTimeout(r,250));}
   await this.seal();
  }else{if((await this.task()).Status!=='stopped')fail('Sealed DMS task restarted');await this.roleCheck(true);}
  const sourceRow=this.source.run(`select coalesce((select jsonb_build_object('lsn',source_commit_fence_lsn) from _byus_barrier.barriers where id=${literal(this.state.barrierId)}::uuid),'{}');`);
  const targetRow=this.target.run(`select coalesce((select jsonb_build_object('lsn',source_commit_fence_lsn) from _byus_barrier.barriers where id=${literal(this.state.barrierId)}::uuid),'{}');`);
  if(sourceRow.lsn!==this.state.sourceCommitFenceLsn||targetRow.lsn!==sourceRow.lsn)fail('DMS source/target committed confirmation row differs');
  const expected=this.state.dmsFinalized?this.state.targetCatalogHash:this.state.dmsCopyCatalogHash;if(targetAudit.catalogHash!==expected)fail('DMS copy-stage target catalog changed');
  const sql=checksumTablesSql(sourceAudit.tables),sourceChecks=this.source.run(sql),targetChecks=this.target.run(sql);
  const expectedNames=sourceAudit.tables.map(t=>`${t.schema}.${t.name}`).sort();
  for(const rows of [sourceChecks,targetChecks])if(!Array.isArray(rows)||sorted(rows.map(t=>`${t.schema}.${t.name}`).sort())!==sorted(expectedNames)||rows.some(t=>!Array.isArray(t.chunks)))fail('DMS checksum table coverage differs');
  const checks=[];for(const t of sourceAudit.tables){const s=sourceChecks.find(r=>r.schema===t.schema&&r.name===t.name).chunks,d=targetChecks.find(r=>r.schema===t.schema&&r.name===t.name).chunks;if(sorted(s)!==sorted(d))fail(`DMS exact row/chunk checksum differs: ${t.schema}.${t.name}`);checks.push({schema:t.schema,name:t.name,chunks:s.length,sha256:hash(s)});}
  if(!this.state.dmsFinalized){this.target.run(this.state.dmsIdentities.map(i=>`alter table ${ident(i.schema)}.${ident(i.table)} alter column ${ident(i.column)} set generated always;`).join('\n')||'select 1;',{json:false});this.state.dmsFinalized=true;}
  this.state.dmsProof={kind:'dms-committed-barrier-quiescent-checksum',barrierId:this.state.barrierId,sourceConfirmationLsn:this.state.sourceCommitFenceLsn,taskArn:this.state.dmsTaskArn,checks,applySealed:true};
  this.target.run(`begin;set local synchronous_commit=on;insert into _byus_migration.dms_proofs values(${literal(this.c.runId)},${literal(hash(this.state.dmsProof))},clock_timestamp()) on conflict(run_id) do update set proof_hash=excluded.proof_hash,verified_at=excluded.verified_at;commit;`,{json:false});
  await this.checkpoint({dmsProofHash:hash(this.state.dmsProof),checks});return this.state.dmsProof;
 }
}

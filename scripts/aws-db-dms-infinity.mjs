import assert from 'node:assert/strict';
import {Database,hash,ident,literal,verifyIdentity,guardStatus} from './aws-db-migrate.mjs';
import {assertPrivateImportLogging} from './aws-db-identity-import.mjs';
const table=t=>`${ident(t.schema)}.${ident(t.name)}`;
const nonfinite=v=>v==='infinity'||v==='-infinity';

export function readInfinitySnapshot(source,schemas){
 const tables=source.run(`select coalesce(jsonb_agg(x order by schema,name),'[]') from (select n.nspname schema,c.relname name,(select jsonb_agg(a.attname order by k.ord) from pg_index i cross join lateral unnest(i.indkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.num where i.indrelid=c.oid and i.indisprimary) pk,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid where n.nspname in(${schemas.map(literal).join(',')}) and c.relkind='r' and a.attnum>0 and not a.attisdropped and a.atttypid in(1082,1114,1184,1186) group by n.nspname,c.relname,c.oid) x;`);
 const found=[];
 for(let i=0;i<tables.length;i+=64){
  const batch=tables.slice(i,i+64),rows=source.run(`set timezone='UTC';select jsonb_agg(x) from (${batch.map((t,j)=>`select ${i+j} idx,coalesce(jsonb_agg(to_jsonb(r)::text order by ${t.pk?.length?t.pk.map(ident).join(','):'to_jsonb(r)::text'}),'[]') rows from ${table(t)} r where ${t.columns.map(c=>`${ident(c.name)}::text in('infinity','-infinity')`).join(' or ')}`).join(' union all ')}) x;`);
  for(const r of rows)if(r.rows.length)found.push({...tables[r.idx],rows:r.rows});
 }
 return found;
}

export function infinityRepairSql(snapshot,{role,runId,barrierId,lsn}){
 const blocks=[];
 for(const t of snapshot){
  assert(t.pk?.length,'Infinity repair requires a primary key');
  assert(t.columns.every(c=>['timestamp with time zone','timestamp without time zone'].includes(c.type)),'Unsupported nonfinite temporal type');
  assert(t.pk.every(k=>!t.columns.some(c=>c.name===k)),'Nonfinite temporal primary key is unsupported');
  assert(t.rows.every(r=>typeof r==='string'&&t.columns.some(c=>nonfinite(JSON.parse(r)[c.name]))),'Unexpected finite-only source row');
  const q=table(t),match=t.pk.map(k=>`tgt.${ident(k)} is not distinct from s.${ident(k)}`).join(' and '),cols=`array[${t.columns.map(c=>literal(c.name)).join(',')}]::text[]`;
  const rows=literal('['+t.rows.join(',')+']')+'::jsonb';
  const body=`declare s ${q}%rowtype; d ${q}%rowtype; n int; begin
   if (select count(*) from jsonb_populate_recordset(null::${q},${rows}))<>(select count(*) from (select distinct ${t.pk.map(ident).join(',')} from jsonb_populate_recordset(null::${q},${rows})) k) then raise exception 'Duplicate source key';end if;
   for s in select * from jsonb_populate_recordset(null::${q},${rows}) loop
    select * into strict d from ${q} tgt where ${match} for update;
    if (to_jsonb(s)-${cols}) is distinct from (to_jsonb(d)-${cols}) then raise exception 'Infinity repair unrelated columns differ';end if;
    ${t.columns.map(c=>{const col=ident(c.name),type=c.type;return `if s.${col}::text in('infinity','-infinity') then
      if d.${col} is distinct from s.${col} and d.${col} is distinct from (case when s.${col}::text='infinity' then '9999-12-31 23:59:59'::${type} else '4713-01-01 00:00:00 BC'::${type} end) then raise exception 'Infinity sentinel differs';end if;
     elsif d.${col} is distinct from s.${col} then raise exception 'Finite timestamp differs';end if;`;}).join('\n')}
    update ${q} tgt set ${t.columns.map(c=>`${ident(c.name)}=s.${ident(c.name)}`).join(',')} where ${match};get diagnostics n=row_count;if n<>1 then raise exception 'Infinity repair row count differs';end if;
    select * into strict d from ${q} tgt where ${match};if to_jsonb(d) is distinct from to_jsonb(s) then raise exception 'Infinity repair postcondition differs';end if;
   end loop;end`;
  let tag='$byus_repair$';while(body.includes(tag))tag=tag.slice(0,-1)+'_'+ '$';
  blocks.push(`do ${tag}${body}${tag};`);
 }
 return `begin;set local timezone='UTC';set local session_replication_role=replica;
 do $guard$ begin
  if session_user<>${literal(role)} then raise exception 'Infinity repair role differs';end if;
  if not exists(select from _byus_barrier.barriers where id=${literal(barrierId)}::uuid and source_commit_fence_lsn=${literal(lsn)}) then raise exception 'Infinity repair barrier differs';end if;
 end $guard$;${blocks.join('\n')}commit;`;
}

export async function restoreInfinity(adapter){
 const {c,state,source,target}=adapter;
 assert(!adapter.rollback&&!state.dmsSealed&&state.phase==='barrier'&&state.barrierId&&state.sourceCommitFenceLsn,'Infinity repair requires unsealed committed barrier');
 const snapshot=readInfinitySnapshot(source,c.schemas),snapshotHash=hash(snapshot);
 if(!snapshot.length)return;
 for(const [side,db] of [['source',source],['target',target]]){
  verifyIdentity(c[side].identity,db.identity());const guard=guardStatus(c,db);
  assert(guard.fenced&&!guard.firstWriteAt&&guard.functionHash===state[side+'GuardHash'],'Infinity repair fence differs');
  assert.equal(db.run(`select source_commit_fence_lsn from _byus_barrier.barriers where id=${literal(state.barrierId)}::uuid;`,{json:false}),state.sourceCommitFenceLsn);
 }
 if(state.dmsInfinityRepair){assert.equal(state.dmsInfinityRepair.snapshotHash,snapshotHash);assert.equal(state.dmsInfinityRepair.barrierId,state.barrierId);}
 await adapter.roleCheck(false);
 const endpoint=adapter.one(adapter.aws(['dms','describe-endpoints','--filters',`Name=endpoint-arn,Values=${c.dms.targetEndpointArn}`]).Endpoints,'infinity target endpoint');
 assert.equal(endpoint.EndpointArn,c.dms.targetEndpointArn);assert.equal(endpoint.SslMode,'verify-full');assert.equal(endpoint.CertificateArn,c.dms.targetCertificateArn);
 const secret=JSON.parse(adapter.aws(['secretsmanager','get-secret-value','--secret-id',endpoint.PostgreSQLSettings.SecretsManagerSecretId]).SecretString);
 assert.equal(secret.host,c.target.host);assert.equal(Number(secret.port),c.target.identity.serverPort);assert.equal(secret.username,c.dms.targetRole);assert(secret.password);
 const envName='BYUS_DMS_INFINITY_TARGET',previous=process.env[envName],copy={...c,target:{...c.target,migrationRole:c.dms.targetRole,connectionEnv:envName,identity:{...c.target.identity,sessionUser:c.dms.targetRole}}};let db;
 try{
  process.env[envName]=`postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port}/${encodeURIComponent(c.target.identity.database)}`;
  db=await Database.open(copy,'target');db.budget=target.budget;verifyIdentity(copy.target.identity,db.identity());
  assertPrivateImportLogging(db);
  db.run(infinityRepairSql(snapshot,{role:c.dms.targetRole,runId:c.runId,barrierId:state.barrierId,lsn:state.sourceCommitFenceLsn}),{json:false});
 }finally{if(previous===undefined)delete process.env[envName];else process.env[envName]=previous;await db?.close();}
 const receipt={runId:c.runId,fencedAt:state.fencedAt,barrierId:state.barrierId,sourceCommitFenceLsn:state.sourceCommitFenceLsn,snapshotHash,tables:snapshot.length,rows:snapshot.reduce((n,t)=>n+t.rows.length,0),values:snapshot.reduce((n,t)=>n+t.rows.reduce((m,r)=>m+t.columns.filter(c=>nonfinite(JSON.parse(r)[c.name])).length,0),0),observedAt:new Date().toISOString()};
 state.dmsInfinityRepair=receipt;await adapter.checkpoint({dmsInfinityRepair:receipt});
}

import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {auditDatabase,catalogHash,hash,literal} from './aws-db-migrate.mjs';

const fail=message=>{throw new Error(`DMS EXECUTE lease: ${message}`);};
const digest=value=>/^[a-f0-9]{64}$/.test(value??'');
const acl=entries=>entries.map(({grantor,grantee,privilege,grantable})=>({grantor,grantee,privilege,grantable})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function checkedFile(path,sha256){
 if(typeof path!=='string'||!digest(sha256))fail('invalid evidence reference');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(!(await file.stat()).isFile())fail('evidence is not a regular file');const raw=await file.readFile('utf8');if(hash(raw)!==sha256)fail('file checksum differs');return raw;}finally{await file.close();}
}
const sealSql=(c)=>`exists(select from pg_roles where rolname=${literal(c.dms.targetRole)} and not rolcanlogin and not has_parameter_privilege(oid,'session_replication_role','SET')) and not exists(select from pg_stat_activity where usename=${literal(c.dms.targetRole)}) and (select count(*)=1 from _byus_migration.state where run_id=${literal(c.runId)} and side='target' and fenced and first_write_at is null)`;
function checkFunctions(a,lease,active){
 for(const f of lease.functions){
  const matches=a.routines.filter(r=>r.schema===f.schema&&r.name===f.name&&r.arguments===f.arguments),r=matches[0];
  if(matches.length!==1||r.securityDefiner!==false||['definitionHash','owner','searchPath','settingsHash'].some(k=>r[k]!==f[k])||!same(acl(r.acl),acl(active?[...f.originalAcl,f.addedAcl]:f.originalAcl)))fail('function metadata or exact ACL differs');
 }
}

// Restoration only: the reviewed grant and durable lease binding are prepared separately.
export async function restoreDmsExecuteLease({c,target,state,audit}){
 const ref=state.dmsExecuteGrantLease;if(!ref)return null;
 const path=resolve(ref.path),lease=JSON.parse(await checkedFile(path,ref.sha256));
 const prepared=state.events?.filter(e=>e.phase==='prepared');
 if(lease.format!==1||lease.runId!==c.runId||state.runId!==c.runId||lease.taskArn!==state.dmsTaskArn||lease.role!==c.dms.targetRole||lease.transportHash!==state.dmsTransportHash||!digest(lease.transportHash)||lease.sourceIdentityHash!==hash(c.source.identity)||lease.targetIdentityHash!==hash(c.target.identity)||!prepared?.some(e=>e.sourceIdentityHash===lease.sourceIdentityHash&&e.targetIdentityHash===lease.targetIdentityHash))fail('run, task, transport or identity binding differs');
 if(!digest(lease.baseCopyCatalogHash)||!digest(lease.copyCatalogHash)||lease.baseCopyCatalogHash===lease.copyCatalogHash||![lease.baseCopyCatalogHash,lease.copyCatalogHash].includes(state.dmsCopyCatalogHash)||!Array.isArray(lease.functions)||!lease.functions.length||!Array.isArray(lease.evidence)||!lease.evidence.length)fail('invalid catalog or evidence binding');
 for(const e of lease.evidence)await checkedFile(resolve(dirname(path),e.path),e.sha256);
 const keys=new Set();
 for(const f of lease.functions){
  const key=JSON.stringify([f.schema,f.name,f.arguments]);
  if(keys.has(key)||f.schema!=='public'||typeof f.name!=='string'||!f.name||typeof f.arguments!=='string'||typeof f.regprocedure!=='string'||!f.regprocedure||!/^[a-f0-9]{32}$/.test(f.definitionHash??'')||typeof f.owner!=='string'||!f.owner||f.securityDefiner!==false||!Array.isArray(f.originalAcl)||f.originalAcl.some(a=>a.grantee===lease.role&&a.privilege==='EXECUTE')||(!f.addedAcl||!same(acl([f.addedAcl]),acl([{grantor:f.owner,grantee:lease.role,privilege:'EXECUTE',grantable:false}]))))fail('invalid exact function grant');
  keys.add(key);
 }
 if(target.run(`select ${sealSql(c)};`,{json:false})!=='t')fail('target apply role or target guard is not sealed');
 for(const f of lease.functions)if(target.run(`set search_path=pg_catalog;select exists(select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=to_regprocedure(${literal(f.regprocedure)}) and n.nspname=${literal(f.schema)} and p.proname=${literal(f.name)} and pg_get_function_identity_arguments(p.oid)=${literal(f.arguments)});`,{json:false})!=='t')fail('regprocedure binding differs');
 // The caller may reuse its fresh audit while the apply/import roles remain sealed.
 const before=audit??await auditDatabase(target);
 if(hash(before.identity)!==lease.targetIdentityHash)fail('actual target identity differs');
 const finalized=state.dmsFinalized===true;
 const active=!finalized&&before.catalogHash===lease.copyCatalogHash;
 if(finalized){if(before.catalogHash!==state.targetCatalogHash)fail('finalized target catalog differs');checkFunctions(before,lease,false);return {restored:true,alreadyRestored:true,baseCopyCatalogHash:lease.baseCopyCatalogHash,copyCatalogHash:lease.copyCatalogHash,functions:lease.functions.length,leaseSha256:ref.sha256};}
 if(!active&&before.catalogHash!==lease.baseCopyCatalogHash)fail('copy catalog differs');
 checkFunctions(before,lease,active);
 // Prove the entire advertised catalog delta is exactly these grants, including unrelated objects.
 const original=structuredClone(before);
 for(const f of lease.functions)original.routines.find(r=>r.schema===f.schema&&r.name===f.name&&r.arguments===f.arguments).acl=before.routines.find(r=>r.schema===f.schema&&r.name===f.name&&r.arguments===f.arguments).acl.filter(a=>!(a.grantor===f.addedAcl.grantor&&a.grantee===f.addedAcl.grantee&&a.privilege==='EXECUTE'&&a.grantable===false));
 if(catalogHash(original)!==lease.baseCopyCatalogHash)fail('catalog delta includes unrelated changes');
 if(active){
  const statements=lease.functions.map(f=>`select p.oid into strict function_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${literal(f.schema)} and p.proname=${literal(f.name)} and pg_get_function_identity_arguments(p.oid)=${literal(f.arguments)} and p.oid=to_regprocedure(${literal(f.regprocedure)}) and not p.prosecdef and pg_get_userbyid(p.proowner)=${literal(f.owner)} and md5(pg_get_functiondef(p.oid))=${literal(f.definitionHash)} and md5(p.proconfig::text) is not distinct from ${f.settingsHash===null?'null':literal(f.settingsHash)} and (select v from unnest(p.proconfig) v where v like 'search_path=%' limit 1) is not distinct from ${f.searchPath===null?'null':literal(f.searchPath)} and (select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'public' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)),'[]') @> ${literal(JSON.stringify([...f.originalAcl,f.addedAcl]))}::jsonb and count(*)=${f.originalAcl.length+1} from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a); execute format('revoke execute on function %s from %I',function_oid::regprocedure,${literal(lease.role)});`).join('\n');
  const body=`declare function_oid oid;begin if not (${sealSql(c)}) then raise exception 'Target not sealed';end if;${statements}end`;
  target.run(`begin;set local search_path=pg_catalog;lock table _byus_migration.state in share row exclusive mode;do ${literal(body)};commit;`,{json:false});
 }
 const after=active?await auditDatabase(target):before;
 checkFunctions(after,lease,false);
 if(after.catalogHash!==lease.baseCopyCatalogHash)fail('restored catalog differs');
 state.dmsCopyCatalogHash=lease.baseCopyCatalogHash;
 return {restored:true,alreadyRestored:!active,baseCopyCatalogHash:lease.baseCopyCatalogHash,copyCatalogHash:lease.copyCatalogHash,functions:lease.functions.length,leaseSha256:ref.sha256};
}

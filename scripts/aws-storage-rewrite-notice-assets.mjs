#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { secureArtifact, validateInventory, validateConnection, sha } from './aws-storage-rewrite-urls.mjs';
import { privateJson } from './aws-storage-migrate.mjs';

export const NOTICE_SCOPE = {
  '3fc0ffb874727ab3178cb8906c29e9e37f45d0188676d0c1af4e6355a8b92094':[2,3,4,5],
  'ec21779766488a408435db5db9fcfe8faaab1ba91dbf07f150e8b889d11b1b88':[2,3,4,5,6,7,8,9],
};
export const EXPECTED = {cells:24,unique:12,hash:'a2d7d5cf8e5de8102a14107f1c6f182f3be3aedb5802eec4bbc151606aa00c89'};
const SOURCE='https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/';
const fail=code=>{throw new Error(code);};
const canonical=value=>JSON.stringify(value,function(_key,item){return item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item;});
const same=(a,b)=>canonical(a)===canonical(b);
const stable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='updated_at'));
const inventoryHash=mappings=>sha(canonical([...mappings.values()]));

export function rewriteNoticeBody(body,noticeId,mappings,scope=NOTICE_SCOPE) {
  const indexes=scope[sha(noticeId)];
  if(!indexes||body?.type!=='doc'||!Array.isArray(body.content))fail('INVALID_NOTICE_BODY');
  const result=structuredClone(body),changes=[];
  for(const index of indexes) {
    const node=result.content[index],mapping=mappings.get(node?.attrs?.src);
    if(node?.type!=='image'||!mapping)fail('NOTICE_IMAGE_SCOPE_DRIFT');
    changes.push({index,old:mapping.old,new:mapping.new});node.attrs.src=mapping.new;
  }
  const visit=(node,path=[])=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='image'&&typeof node.attrs?.src==='string'&&node.attrs.src.startsWith(SOURCE)&&
       !(path.length===2&&path[0]==='content'&&indexes.includes(path[1])))fail('UNPLANNED_NOTICE_IMAGE');
    for(const [key,value] of Object.entries(node))visit(value,[...path,Array.isArray(node)?Number(key):key]);
  };
  visit(body);
  return {body:result,changes};
}
export function makeNoticePlan(snapshot,mappings,expected=EXPECTED,scope=NOTICE_SCOPE) {
  const ids=Object.keys(scope);
  if(snapshot.parents?.length!==2||snapshot.rows?.length!==4||new Set(snapshot.parents.map(item=>item.row.id)).size!==2)fail('NOTICE_SCOPE_DRIFT');
  for(const parent of snapshot.parents) {
    if(!ids.includes(sha(parent.row.id))||parent.row.publication_status!=='published'||parent.row.archived_at!==null||parent.row.visibility!=='public'||
       parent.celebrity?.id!==parent.row.celebrity_id||parent.celebrity.status!=='published'||parent.celebrity.archived_at!==null)fail('NOTICE_NOT_PUBLIC');
    const locales=snapshot.rows.filter(row=>row.notice_id===parent.row.id).map(row=>row.locale).sort();
    if(!same(locales,['en','ko']))fail('NOTICE_LOCALES_INCOMPLETE');
  }
  const unique=new Set();let cells=0;
  const rows=snapshot.rows.map(row=>{
    const rewritten=rewriteNoticeBody(row.body_json,row.notice_id,mappings,scope);
    for(const change of rewritten.changes){unique.add(change.old);cells++;}
    return {row:structuredClone(row),afterBody:rewritten.body,changes:rewritten.changes};
  }).sort((a,b)=>a.row.notice_id.localeCompare(b.row.notice_id)||a.row.locale.localeCompare(b.row.locale));
  const summary={cells,unique:unique.size,hash:sha(JSON.stringify([...unique].sort()))};
  if(!same(summary,expected))fail('NOTICE_URL_SET_DRIFT');
  return {schemaVersion:1,kind:'notice-public-asset-rewrite',inventoryHash:inventoryHash(mappings),summary,parents:structuredClone(snapshot.parents),rows};
}
async function readSnapshot(db,ids,lock=false) {
  if(!ids)ids=(await db.query('select distinct notice_id::text as id from public.celebrity_notice_localizations where body_json::text ilike $1',[`%${new URL(SOURCE).hostname}%`])).rows.map(row=>row.id);
  const parents=(await db.query(`select to_jsonb(n) as row,to_jsonb(c) as celebrity from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id where n.id::text=any($1::text[]) order by n.id${lock?' for share of n,c':''}`,[ids])).rows;
  const rows=(await db.query(`select to_jsonb(t) as row from public.celebrity_notice_localizations t where notice_id::text=any($1::text[]) order by notice_id,locale${lock?' for update':''}`,[ids])).rows.map(item=>item.row);
  return {parents,rows};
}
async function publishable(db,ids) {
  for(const id of ids)await db.query('select public.assert_notice_publishable($1::uuid)',[id]);
}
async function registry(db,plan,mappings) {
  const paths=[...new Set(plan.rows.flatMap(item=>item.changes.map(change=>mappings.get(change.old).path)))];
  const rows=(await db.query("select o.name,o.state,exists(select 1 from public.s3_storage_delete_outbox d where d.bucket_id=o.bucket_id and d.name=o.name) as delete_queued from public.s3_storage_objects o where o.bucket_id='cms-assets' and o.name=any($1::text[]) order by o.name",[paths])).rows;
  if(rows.length!==paths.length||rows.some(row=>row.state!=='ready'||row.delete_queued))fail('PUBLIC_STORAGE_NOT_READY');
  return rows;
}
export async function rewriteNoticeAssets({db,plan,mappings,backupPath,rollback=false,expected=EXPECTED,scope=NOTICE_SCOPE}) {
  if(plan?.schemaVersion!==1||plan.kind!=='notice-public-asset-rewrite'||plan.inventoryHash!==inventoryHash(mappings))fail('INVALID_NOTICE_PLAN');
  const canonicalPlan=makeNoticePlan({parents:plan.parents,rows:plan.rows.map(item=>item.row)},mappings,expected,scope);
  if(!same(canonicalPlan,plan.backupVersion===undefined?plan:Object.fromEntries(Object.keys(canonicalPlan).map(key=>[key,plan[key]]))))fail('INVALID_NOTICE_PLAN');
  let begun=false;
  try {
    await db.query('begin');begun=true;
    await db.query("set local lock_timeout='5s';set local statement_timeout='15s';set local idle_in_transaction_session_timeout='15s'");
    if((await db.query('show session_replication_role')).rows[0]?.session_replication_role!=='origin')fail('UNSAFE_TRIGGER_SESSION');
    const ids=plan.parents.map(item=>item.row.id);
    const before=await readSnapshot(db,ids,true);
    if(!same(before.parents,plan.parents)||before.rows.length!==4)fail('NOTICE_PARENT_OR_LOCALE_DRIFT');
    await publishable(db,ids);
    for(const item of plan.rows) {
      const row=before.rows.find(row=>row.notice_id===item.row.notice_id&&row.locale===item.row.locale);
      const expectedRow={...item.row,body_json:rollback?item.afterBody:item.row.body_json};
      if(!row||!same(stable(row),stable(expectedRow)))fail('NOTICE_BODY_CAS_CONFLICT');
    }
    await db.query('lock table public.s3_storage_objects,public.s3_storage_delete_outbox in share mode');
    const storage=await registry(db,plan,mappings);
    await secureArtifact(backupPath,{...canonicalPlan,backupVersion:1,direction:rollback?'rollback':'apply',createdAt:new Date().toISOString(),lockedRows:before.rows});
    for(const item of plan.rows) {
      const oldBody=rollback?item.afterBody:item.row.body_json,newBody=rollback?item.row.body_json:item.afterBody;
      const result=await db.query('update public.celebrity_notice_localizations set body_json=$1::jsonb where notice_id::text=$2 and locale::text=$3 and body_json is not distinct from $4::jsonb',[JSON.stringify(newBody),item.row.notice_id,item.row.locale,JSON.stringify(oldBody)]);
      if(result.rowCount!==1)fail('NOTICE_BODY_CAS_CONFLICT');
    }
    await db.query('set constraints all immediate');
    await publishable(db,ids);
    const after=await readSnapshot(db,ids,true);
    if(!same(before.parents,after.parents)||after.rows.length!==4)fail('NOTICE_PARENT_CHANGED');
    for(const item of plan.rows) {
      const row=after.rows.find(row=>row.notice_id===item.row.notice_id&&row.locale===item.row.locale);
      const expectedRow={...item.row,body_json:rollback?item.row.body_json:item.afterBody};
      if(!row||!same(stable(row),stable(expectedRow)))fail('NOTICE_FINAL_ROW_MISMATCH');
    }
    if(!same(storage,await registry(db,plan,mappings)))fail('NOTICE_STORAGE_CHANGED');
    await db.query('commit');begun=false;
    return {...plan.summary,rows:4,rollback};
  }catch(error){if(begun)try{await db.query('rollback');}catch{}throw error;}
}
async function main() {
  const args=process.argv.slice(2),options={};let mode='dry-run';
  for(let i=0;i<args.length;i++) {
    if(['--apply','--rollback'].includes(args[i])){if(mode!=='dry-run')fail('INVALID_ARGUMENTS');mode=args[i].slice(2);}
    else if(['--config','--inventory','--plan','--backup','--local-port'].includes(args[i])&&args[i+1]&&!options[args[i].slice(2)])options[args[i].slice(2)]=args[++i];
    else fail('INVALID_ARGUMENTS');
  }
  if(!options.config||!options.inventory||!options.plan||(mode!=='dry-run'&&!options.backup))fail('USAGE_CONFIG_INVENTORY_PLAN_BACKUP');
  const config=validateConnection(await privateJson(options.config)),mappings=validateInventory(await privateJson(options.inventory));
  const port=Number(options['local-port']??15490);if(!Number.isInteger(port)||port<1024||port>65535)fail('INVALID_LOCAL_PORT');
  const command=args=>JSON.parse(execFileSync('aws',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  if(command(['sts','get-caller-identity','--output','json']).Account!=='996702758024')fail('WRONG_AWS_ACCOUNT');
  const secret=JSON.parse(command(['secretsmanager','get-secret-value','--secret-id',config.secretArn,'--region','ap-northeast-2','--output','json']).SecretString);
  if(typeof secret.password!=='string'||!secret.password)fail('DATABASE_PASSWORD_MISSING');
  const require=createRequire(new URL('../apps/web/package.json',import.meta.url));const {Client}=require('pg');
  const db=new Client({host:'127.0.0.1',port,database:config.database,user:config.user,password:secret.password,ssl:{rejectUnauthorized:true,servername:config.host,ca:await readFile(config.sslrootcert,'utf8')},connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});
  try {
    await db.connect();
    if(mode==='dry-run') {
      await db.query('begin read only');
      const plan=makeNoticePlan(await readSnapshot(db),mappings);await registry(db,plan,mappings);await publishable(db,plan.parents.map(item=>item.row.id));
      await db.query('rollback');await secureArtifact(options.plan,plan);console.log(JSON.stringify({mode,...plan.summary,rows:4}));
    }else {
      const plan=await privateJson(options.plan);
      if(mode==='rollback'&&(plan.backupVersion!==1||plan.direction!=='apply'))fail('APPLY_BACKUP_REQUIRED');
      console.log(JSON.stringify({mode,...await rewriteNoticeAssets({db,plan,mappings,backupPath:options.backup,rollback:mode==='rollback'})}));
    }
  }finally{await db.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(/^[A-Z_]{1,80}$/.test(error.message)?error.message:'NOTICE_ASSET_REWRITE_FAILED');process.exitCode=1;});

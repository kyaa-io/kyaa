#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { privateJson } from './aws-storage-migrate.mjs';

export const SCOPE = Object.freeze({
  live_events:['approved_hero_url'], public_image_assets:['url'], celebrities:['image_url'], group_pages:['image_url'],
  live_event_previews:['square_video_url','square_poster_url','landscape_video_url','landscape_poster_url'],
  live_survey_options:['media_url'], live_survey_questions:['media_url'],
});
export const GUARDS = {live_survey_questions:'live_survey_questions_protect_snapshot',live_survey_options:'live_survey_options_protect_snapshot'};
export const EXPECTED = {cells:144,unique:61,hash:'a1aa03beb6916ff60e3c4dc29b386844cedaa573e3b0944a0983f85142ff838e'};
const SOURCE = 'https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/';
const TARGET = 'https://kyaa.io/public-assets/cms-assets/';
const HOST = 'byus-prod-platform-database-40n9gar79vuq.chaamoiiyd3w.ap-northeast-2.rds.amazonaws.com';
const SECRET = 'arn:aws:secretsmanager:ap-northeast-2:996702758024:secret:rds!db-bff1dd89-63c4-4f14-8e15-b02b0b7f56d9-ZKMkGu';
const fail = code => { throw new Error(code); };
export const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, function (_key, item) { return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item; });
const same = (a,b) => canonical(a) === canonical(b);
const qualified = table => { if (!Object.hasOwn(SCOPE,table)) fail('INVALID_SCOPE'); return `public.${table}`; };
const semantic = (row, columns) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updated_at' && !columns.includes(key)));

export function validateInventory(inventory) {
  if (inventory?.environment !== 'prod' || inventory.verified !== true || inventory.sourceProjectRef !== 'gmrykvmtmuaeswpajteq' || inventory.rewriteManifest?.length !== 79) fail('INVALID_INVENTORY');
  const mappings = new Map(), destinations = new Set();
  for (const item of inventory.rewriteManifest) {
    if (!item || Object.keys(item).sort().join(',') !== 'new,old' || typeof item.old !== 'string' || !item.old.startsWith(SOURCE)) fail('INVALID_PUBLIC_MAPPING');
    const url = new URL(item.old);
    if (url.username || url.password || url.search || url.hash) fail('INVALID_PUBLIC_MAPPING');
    let path; try { path = decodeURIComponent(item.old.slice(SOURCE.length)); } catch { fail('INVALID_PUBLIC_MAPPING'); }
    if (!path || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') ||
        item.old !== SOURCE + path.split('/').map(encodeURIComponent).join('/') || item.new !== TARGET + path.split('/').map(encodeURIComponent).join('/') || mappings.has(item.old) || destinations.has(item.new)) fail('INVALID_PUBLIC_MAPPING');
    const object = inventory.objects?.find(row => row.bucket_id === 'cms-assets' && row.name === path);
    const proof = object && inventory.blobObjects?.find(proof=>proof.sourceObjectIdSha256===sha(object.id));
    if (!object || !proof || proof.sourceObjectIdSha256 !== sha(object.id) || !/^[a-f0-9]{64}$/.test(proof.sourceSha256 ?? '') || proof.sourceSha256 !== proof.targetSha256 ||
        !Number.isSafeInteger(proof.sourceBytes) || proof.sourceBytes <= 0 || proof.sourceBytes !== proof.targetBytes || Number(object.metadata?.size) !== proof.sourceBytes) fail('UNVERIFIED_PUBLIC_OBJECT');
    mappings.set(item.old,{old:item.old,new:item.new,path,sha256:proof.targetSha256,bytes:proof.targetBytes}); destinations.add(item.new);
  }
  return mappings;
}
export function validateRows(rows, mappings, expected = EXPECTED) {
  const unique = new Set(); let cells = 0;
  for (const item of rows) {
    const columns = SCOPE[item.table];
    if (!columns || typeof item.id !== 'string' || !item.id || String(item.row?.id) !== item.id || !item.changes || !Object.keys(item.changes).length) fail('INVALID_PLAN');
    for (const [column,change] of Object.entries(item.changes)) {
      const mapping = mappings.get(change.old);
      if (!columns.includes(column) || !mapping || change.new !== mapping.new || item.row[column] !== change.old) fail('UNMAPPED_PUBLIC_URL');
      unique.add(change.old); cells++;
    }
  }
  if (new Set(rows.map(row => `${row.table}/${row.id}`)).size !== rows.length) fail('DUPLICATE_PLAN_ROW');
  const summary = {cells,unique:unique.size,hash:sha(JSON.stringify([...unique].sort()))};
  if (!same(summary,expected)) fail('REWRITE_SCOPE_DRIFT');
  return summary;
}
export function makePlan(rows, mappings, expected = EXPECTED) {
  const result=[];
  for (const {table,row} of rows) {
    const changes={};
    for (const column of SCOPE[table] ?? fail('INVALID_SCOPE')) {
      const value=row[column];
      if (typeof value === 'string' && value.startsWith(SOURCE)) {
        const mapping=mappings.get(value); if (!mapping) fail('UNMAPPED_PUBLIC_URL');
        changes[column]={old:value,new:mapping.new};
      }
    }
    if (Object.keys(changes).length) result.push({table,id:String(row.id),row:structuredClone(row),changes});
  }
  result.sort((a,b)=>a.table.localeCompare(b.table)||a.id.localeCompare(b.id));
  return {schemaVersion:1,kind:'cms-public-url-rewrite',inventoryHash:sha(canonical([...mappings.values()])),summary:validateRows(result,mappings,expected),rows:result};
}
export function updateStatement(item, currentRow, rollback = false) {
  const columns = SCOPE[item.table]; if (!columns) fail('INVALID_SCOPE');
  const values=[],set=[],where=[];
  for (const [column,change] of Object.entries(item.changes)) {
    if (!columns.includes(column)) fail('INVALID_SCOPE');
    const before=rollback?change.new:change.old,after=rollback?change.old:change.new;
    if (currentRow[column] !== before) fail('REWRITE_CAS_CONFLICT');
    values.push(after);set.push(`"${column}"=$${values.length}`);
    values.push(before);where.push(`"${column}" is not distinct from $${values.length}`);
  }
  const expectedRow={...item.row,...Object.fromEntries(Object.entries(item.changes).map(([column,change])=>[column,rollback?change.new:change.old]))};
  if (!same(semantic(currentRow,[]),semantic(expectedRow,[]))) fail('REWRITE_ROW_DRIFT');
  values.push(item.id);where.push(`id::text=$${values.length}`);
  return {text:`update ${qualified(item.table)} as t set ${set.join(',')} where ${where.join(' and ')} returning to_jsonb(t) as row`,values};
}
export async function secureArtifact(path, value) {
  const absolute=resolve(path);
  if (!absolute.split(sep).includes('work')) fail('ARTIFACT_MUST_BE_IN_WORK');
  // Exclusive, non-following creation preserves both prior backups and user files.
  const file=await open(absolute,'wx',0o600);
  try { await file.writeFile(JSON.stringify(value));await file.sync(); } finally { await file.close(); }
}
async function readRows(db) {
  const rows=[];
  for (const [table,columns] of Object.entries(SCOPE)) {
    const result=await db.query(`select to_jsonb(t) as row from ${qualified(table)} t where ${columns.map(column=>`"${column}" like $1`).join(' or ')} order by id`,[SOURCE+'%']);
    rows.push(...result.rows.map(({row})=>({table,row})));
  }
  return rows;
}
async function triggerState(db) {
  return (await db.query("select n.nspname as schema,c.relname as table,t.tgname as name,t.tgenabled as enabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,t.tgname",[Object.keys(SCOPE)])).rows;
}
async function registry(db,plan,mappings) {
  const paths=[...new Set(plan.rows.flatMap(item=>Object.values(item.changes).map(change=>mappings.get(change.old).path)))];
  const rows=(await db.query("select o.name,o.state,exists(select 1 from public.s3_storage_delete_outbox d where d.bucket_id=o.bucket_id and d.name=o.name) as delete_queued from public.s3_storage_objects o where o.bucket_id='cms-assets' and o.name=any($1::text[]) order by o.name",[paths])).rows;
  if (rows.length !== paths.length || rows.some(row=>row.state !== 'ready'||row.delete_queued)) fail('PUBLIC_STORAGE_NOT_READY');
}
export async function rewrite({db,plan,mappings,backupPath,rollback=false,expected=EXPECTED}) {
  if (plan?.schemaVersion !== 1 || plan.kind !== 'cms-public-url-rewrite' || plan.inventoryHash !== sha(canonical([...mappings.values()]))) fail('INVALID_PLAN');
  validateRows(plan.rows,mappings,expected);
  let begun=false;
  try {
    await db.query('begin');begun=true;
    await db.query("set local lock_timeout='5s';set local statement_timeout='15s';set local idle_in_transaction_session_timeout='15s'");
    if ((await db.query('show session_replication_role')).rows[0]?.session_replication_role !== 'origin') fail('UNSAFE_TRIGGER_SESSION');
    await db.query(`lock table ${Object.keys(SCOPE).sort().map(qualified).join(',')} in share row exclusive mode`);
    for (const table of Object.keys(GUARDS).sort()) await db.query(`lock table ${qualified(table)} in access exclusive mode`);
    const triggers=await triggerState(db);
    for (const [table,name] of Object.entries(GUARDS)) {
      if (!triggers.some(row=>row.table===table&&row.name===name&&['O','A','R','D'].includes(row.enabled))) fail('SURVEY_GUARD_NOT_FOUND');
    }
    await db.query('lock table public.s3_storage_objects,public.s3_storage_delete_outbox in share mode');
    await registry(db,plan,mappings);
    const locked=[];
    for (const item of plan.rows) {
      const row=(await db.query(`select to_jsonb(t) as row from ${qualified(item.table)} t where id::text=$1 for update`,[item.id])).rows[0]?.row;
      if (!row) fail('REWRITE_ROW_MISSING');
      locked.push({item,row});
    }
    if (!rollback && locked.every(({item,row})=>Object.entries(item.changes).every(([column,change])=>row[column]===change.new))) {
      const prior=await privateJson(backupPath);
      if(prior.backupVersion!==1||prior.direction!=='apply'||!same(prior.rows,plan.rows)||prior.inventoryHash!==plan.inventoryHash) fail('MATCHING_APPLY_BACKUP_REQUIRED');
      for(const {item,row} of locked) updateStatement(item,row,true);
      if((await readRows(db)).length)fail('LEGACY_URLS_REMAIN');
      await db.query('rollback');begun=false;return {...plan.summary,rows:plan.rows.length,alreadyApplied:true,rollback:false};
    }
    for(const entry of locked)entry.statement=updateStatement(entry.item,entry.row,rollback);
    if (!rollback) {
      const observed=makePlan(await readRows(db),mappings,expected);
      if (!same(observed.rows.map(item=>({...item,row:semantic(item.row,[])})),plan.rows.map(item=>({...item,row:semantic(item.row,[])})))) fail('REWRITE_PLAN_DRIFT');
    }
    const beforeInvariants=await invariantState(db,plan,mappings);
    await secureArtifact(backupPath,{...plan,backupVersion:1,direction:rollback?'rollback':'apply',createdAt:new Date().toISOString(),lockedRows:locked.map(({item,row})=>({table:item.table,id:item.id,row})),triggers,invariants:beforeInvariants});
    for (const [table,name] of Object.entries(GUARDS)) await db.query(`alter table ${qualified(table)} disable trigger "${name}"`);
    for (const {item,row,statement} of locked) {
      const result=await db.query(statement.text,statement.values);
      if (result.rowCount !== 1 || !same(semantic(row,Object.keys(item.changes)),semantic(result.rows[0].row,Object.keys(item.changes)))) fail('REWRITE_CONTENT_CHANGED');
    }
    for (const [table,name] of Object.entries(GUARDS)) {
      const state=triggers.find(row=>row.table===table&&row.name===name).enabled;
      const command={O:'enable trigger',A:'enable always trigger',R:'enable replica trigger',D:'disable trigger'}[state];
      await db.query(`alter table ${qualified(table)} ${command} "${name}"`);
    }
    if (!same(triggers,await triggerState(db))) fail('TRIGGER_RESTORE_MISMATCH');
    await db.query('set constraints all immediate');
    for (const {item,row} of locked) {
      const finalRow=(await db.query(`select to_jsonb(t) as row from ${qualified(item.table)} t where id::text=$1 for update`,[item.id])).rows[0]?.row;
      const expectedRow={...row,...Object.fromEntries(Object.entries(item.changes).map(([column,change])=>[column,rollback?change.old:change.new]))};
      if (!finalRow || !same(semantic(finalRow,[]),semantic(expectedRow,[]))) fail('REWRITE_FINAL_ROW_MISMATCH');
    }
    if (!same(beforeInvariants,await invariantState(db,plan,mappings))) fail('REWRITE_INVARIANT_CHANGED');
    const remaining=await readRows(db);
    if (rollback) {
      const restored=makePlan(remaining,mappings,expected);
      if (!same(restored.rows.map(item=>({...item,row:semantic(item.row,[])})),plan.rows.map(item=>({...item,row:semantic(item.row,[])})))) fail('ROLLBACK_VERIFY_FAILED');
    } else if (remaining.length || (await db.query('select count(*)::int as count from public.published_celebrities where image_url like $1',[SOURCE+'%'])).rows[0]?.count !== 0) fail('LEGACY_URLS_REMAIN');
    await db.query('commit');begun=false;
    return {...plan.summary,rows:plan.rows.length,rollback};
  } catch(error) {
    if (begun) { try { await db.query('rollback'); } catch {} }
    throw error;
  }
}
// Only aggregate hashes leave PostgreSQL for related data; no response content is printed or backed up.
async function invariantState(db,plan,mappings) {
  const questionIds=[...new Set(plan.rows.flatMap(item=>item.table==='live_survey_questions'?[item.id]:item.table==='live_survey_options'?[item.row.question_id]:[]))];
  const surveyIds=(await db.query('select distinct survey_id::text as id from public.live_survey_questions where id::text=any($1::text[])',[questionIds])).rows.map(row=>row.id);
  const assetIds=plan.rows.filter(item=>item.table==='public_image_assets').map(item=>item.id);
  const ownerIds=plan.rows.filter(item=>['live_events','celebrities'].includes(item.table)).map(item=>item.id);
  const paths=[...new Set(plan.rows.flatMap(item=>Object.values(item.changes).map(change=>mappings.get(change.old).path)))];
  const scopes=[
    ['live_surveys','id::text=any($1::text[])',[surveyIds]],
    ['live_survey_responses','survey_id::text=any($1::text[])',[surveyIds]],
    ['live_survey_answers','question_id::text=any($1::text[])',[questionIds]],
    ['public_image_role_bindings','asset_id::text=any($1::text[]) or owner_id::text=any($2::text[])',[assetIds,ownerIds]],
    ['s3_storage_objects',"bucket_id='cms-assets' and name=any($1::text[])",[paths]],
    ['s3_storage_delete_outbox',"bucket_id='cms-assets' and name=any($1::text[])",[paths]],
  ];
  const result=[];
  for(const [table,where,values] of scopes) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as hash from public.${table} t where ${where}`,values)).rows[0].hash);
  return result;
}
export function validateConnection(config) {
  if (config?.host !== HOST || config.database !== 'byus' || config.user !== 'byus_admin' || config.sslmode !== 'verify-full' || config.secretArn !== SECRET || typeof config.sslrootcert !== 'string') fail('INVALID_PRODUCTION_CONNECTION');
  return config;
}
async function main() {
  const flags=process.argv.slice(2);const options={};let mode='dry-run';
  for (let i=0;i<flags.length;i++) {
    const flag=flags[i];
    if (['--apply','--rollback'].includes(flag)) { if(mode!=='dry-run')fail('INVALID_ARGUMENTS');mode=flag.slice(2); }
    else if (['--config','--inventory','--plan','--backup','--local-port'].includes(flag) && flags[i+1] && !options[flag.slice(2)]) options[flag.slice(2)]=flags[++i];
    else fail('INVALID_ARGUMENTS');
  }
  if (!options.config||!options.inventory||!options.plan||(mode!=='dry-run'&&!options.backup)) fail('USAGE_CONFIG_INVENTORY_PLAN_BACKUP');
  const config=validateConnection(await privateJson(options.config));
  const mappings=validateInventory(await privateJson(options.inventory));
  const port=Number(options['local-port']??15490);if(!Number.isInteger(port)||port<1024||port>65535)fail('INVALID_LOCAL_PORT');
  const account=JSON.parse(execFileSync('aws',['sts','get-caller-identity','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  if(account.Account!=='996702758024')fail('WRONG_AWS_ACCOUNT');
  const secret=JSON.parse(JSON.parse(execFileSync('aws',['secretsmanager','get-secret-value','--secret-id',SECRET,'--region','ap-northeast-2','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).SecretString);
  if(typeof secret.password!=='string'||!secret.password)fail('DATABASE_PASSWORD_MISSING');
  const require=createRequire(new URL('../apps/web/package.json',import.meta.url));const {Client}=require('pg');
  const db=new Client({host:'127.0.0.1',port,database:config.database,user:config.user,password:secret.password,ssl:{rejectUnauthorized:true,servername:HOST,ca:await readFile(config.sslrootcert,'utf8')},connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});
  try {
    await db.connect();
    if(mode==='dry-run') {
      await db.query('begin read only');
      const plan=makePlan(await readRows(db),mappings);await registry(db,plan,mappings);
      await db.query('rollback');await secureArtifact(options.plan,plan);console.log(JSON.stringify({...plan.summary,rows:plan.rows.length,mode}));
    } else {
      const saved=await privateJson(options.plan);
      if(mode==='rollback'&&(saved.backupVersion!==1||saved.direction!=='apply'))fail('APPLY_BACKUP_REQUIRED');
      console.log(JSON.stringify({mode,...await rewrite({db,plan:saved,mappings,backupPath:options.backup,rollback:mode==='rollback'})}));
    }
  } finally { await db.end().catch(()=>{}); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(/^[A-Z_]{1,80}$/.test(error.message)?error.message:'PUBLIC_URL_REWRITE_FAILED');process.exitCode=1;});

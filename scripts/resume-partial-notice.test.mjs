import test from 'node:test';
import assert from 'node:assert/strict';
import {planPartial,resumePartial,hash} from './resume-partial-notice.mjs';
const batches=Array.from({length:36},(_,i)=>({text:`batch ${i}`,images:[]}));
function fixture(){
 const source={id:10,external_id:'100',status:'completed',conclusion:'action_required',output:{summary:JSON.stringify({deploymentId:100,base:'a'.repeat(40),reason:'DEPLOYMENT_VERIFICATION_UNAVAILABLE',batchCount:36,delivered:batches.slice(0,11).map((b,i)=>({...b,messageId:1000+i,messageIds:[1000+i]}))})}};
 const plan=planPartial(source,batches,200),target={id:200,sha:'b'.repeat(40)},db=new Map([[10,structuredClone(source)]]),sent=[];
 const github=async(path,init)=>{
  if(!init)return path.startsWith('/check-runs/')?structuredClone(db.get(Number(path.split('/').at(-1)))):{check_runs:[...db.values()].filter(r=>r.id!==10)};
  const id=path==='/check-runs'?20:Number(path.split('/').at(-1));
  db.set(id,{...db.get(id),...structuredClone(init.body),id,app:{slug:'github-actions'}});return structuredClone(db.get(id));
 };
 const send=async b=>{sent.push(b.text);return {messageId:2000+sent.length};};
 return {source,plan,target,db,sent,options:{github,source,target,batches,plan,expectedHash:plan.planHash,send}};
}
test('36 batches: only remaining 25 are sent, old receipt succeeds after all confirmations',async()=>{const f=fixture();await resumePartial(f.options);assert.deepEqual(f.sent,batches.slice(11).map(b=>b.text));assert.equal(f.db.get(10).conclusion,'success');assert.equal(f.db.get(20).conclusion,'failure');});
test('uncertain POST stops retries without resending confirmed prefix',async()=>{const f=fixture();await assert.rejects(resumePartial({...f.options,send:async()=>{throw new Error('network');}}));assert.equal(f.db.get(20).status,'in_progress');await assert.rejects(resumePartial(f.options),/UNCERTAIN_BATCH/);assert.equal(f.sent.length,0);assert.equal(f.db.get(10).conclusion,'action_required');});
test('definite pre-send rejection resumes the same unsent hash',async()=>{const f=fixture();await assert.rejects(resumePartial({...f.options,send:async()=>{throw Object.assign(new Error('unavailable'),{definitelyNotSent:true});}}));await resumePartial(f.options);assert.equal(f.sent.length,25);});
test('mismatched delivered hash and uncertain legacy reason fail closed',()=>{const f=fixture();assert.throws(()=>planPartial(f.source,[{text:'wrong'},...batches.slice(1)],200),/MISMATCH/);const s=structuredClone(f.source),p=JSON.parse(s.output.summary);p.reason='NOTICE_TRANSPORT_FAILED';s.output.summary=JSON.stringify(p);assert.throws(()=>planPartial(s,batches,200),/UNCERTAIN_BATCH/);});
test('stale plan and changed source cannot write or send',async()=>{const f=fixture();await assert.rejects(resumePartial({...f.options,expectedHash:'wrong'}),/PLAN_HASH/);f.db.get(10).output.summary='{}';await assert.rejects(resumePartial(f.options),/SOURCE_RECEIPT_CHANGED/);assert.equal(f.db.size,1);});
test('finalization can repeat without any POST to Telegram',async()=>{const f=fixture();await resumePartial(f.options);f.sent.length=0;await resumePartial(f.options);assert.equal(f.sent.length,0);});
test('lost checkpoint response after a send cannot replay that batch',async()=>{const f=fixture();const original=f.options.github;let fail=true;const github=async(path,init)=>{if(fail&&path==='/check-runs/20'&&init&&JSON.parse(init.body.output.summary).delivered.length===1){fail=false;throw new Error('checkpoint failed');}return original(path,init);};await assert.rejects(resumePartial({...f.options,github}),/checkpoint/);assert.equal(f.sent.length,1);await assert.rejects(resumePartial(f.options),/UNCERTAIN_BATCH/);assert.equal(f.sent.length,1);});
test('workflow shares production lock and requires main plus prod',async()=>{const {readFileSync}=await import('node:fs');const {load}=await import('js-yaml');const w=load(readFileSync('.github/workflows/deployment-notices.yml','utf8')),j=w.jobs['partial-recovery'];assert.match(j.if,/refs\/heads\/main/);assert.match(j.if,/inputs.environment == 'prod'/);assert.equal(j.concurrency.group,'telegram-production-notices');assert.equal(j.concurrency['cancel-in-progress'],false);assert.equal(j.permissions.checks,'write');assert.equal(j.steps.at(-1).env.NOTICE_PLAN_HASH,'${{ inputs.plan_hash }}');assert.match(w.jobs.recover.if,/inputs.operation == 'recover'/);});

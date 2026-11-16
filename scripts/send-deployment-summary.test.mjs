// Gate repository overrides must not reach fixture Git, CLI children, or in-process readNotes.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash,summaryManifest,summaryText,summaryMessages,summaryPlanHash,verifySummarySources,validateSource,sendSummary,sendSummaryMessages,loadSummaryManifest,sendSummaryTelegram} from './send-deployment-summary.mjs';
import {receiptState} from './deployment-notices.mjs';
function fixture(baseManifest=summaryManifest){
 const source={id:10,name:'Telegram deployment notice',app:{slug:'github-actions'},head_sha:'a'.repeat(40),external_id:'100',status:'completed',conclusion:'action_required',output:{summary:JSON.stringify({deploymentId:100,batchCount:36,delivered:Array.from({length:11},(_,i)=>({text:`old ${i}`,images:[],messageId:1000+i,messageIds:[1000+i]}))})}};
 const prior=JSON.parse(source.output.summary);
 const manifest={...baseManifest,sourceReceiptId:10,sourceDeploymentId:100,targetDeploymentId:200,baseSha:source.head_sha,headSha:'b'.repeat(40),sourceReceiptHash:hash(source.output.summary),originalBatchHashes:[...prior.delivered.map(b=>hash({text:b.text,images:b.images})),...Array.from({length:25},(_,i)=>hash(i))]};
 const target={id:200,sha:manifest.headSha},db=new Map([[10,structuredClone(source)]]),sent=[];
 const github=async(path,init)=>{if(!init)return path.startsWith('/check-runs/')?structuredClone(db.get(Number(path.split('/').at(-1)))):{check_runs:[...db.values()].filter(r=>r.id!==10)};
 const id=path==='/check-runs'?20:Number(path.split('/').at(-1));db.set(id,{...db.get(id),...structuredClone(init.body),id,app:{slug:'github-actions'}});return structuredClone(db.get(id));};
 return {manifest,target,db,sent,options:{github,target,manifest,expectedHash:hash(manifest),send:async body=>{sent.push(body);return {chatId:-5187701508,messageId:2000};}}};
}
test('pinned note contents and source validation work in an isolated Git fixture',()=>{
 const repository=mkdtempSync(join(tmpdir(),'notice-summary-sources-'));
 const git=(...args)=>execFileSync('git',['-c','user.name=Notice test','-c','user.email=notice@example.invalid',...args],{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init','-q');git('commit','--allow-empty','-qm','base');
  const baseSha=git('rev-parse','HEAD');
  // Use the archived immutable files and their real pinned hashes; only history is synthetic.
  for(const note of summaryManifest.notes){
   const destination=join(repository,note.path);mkdirSync(dirname(destination),{recursive:true});
   copyFileSync(new URL('../'+note.path,import.meta.url),destination);
  }
  git('add','release-notes');git('commit','-qm','pinned release notes');
  const manifest={...summaryManifest,baseSha,headSha:git('rev-parse','HEAD')};
  verifySummarySources(manifest,repository);
  assert.throws(()=>verifySummarySources({...manifest,notes:manifest.notes.slice(1)},repository),/SUMMARY_NOTE_SET_CHANGED/);
  assert.throws(()=>verifySummarySources({...manifest,notes:manifest.notes.map((note,i)=>i===0?{...note,sha256:'0'.repeat(64)}:note)},repository),/SUMMARY_NOTE_CHANGED/);
  assert.throws(()=>verifySummarySources({...manifest,baseSha:manifest.headSha,headSha:baseSha},repository));
  assert.equal(summaryManifest.notes.length,61);
  assert.equal(summaryText(summaryManifest).split('\n').length,10);
  assert.match(summaryText(summaryManifest),/외 53건/);
 }finally{rmSync(repository,{recursive:true,force:true});}
});
test('one summary replaces 25 unsent batches without pretending all 36 were delivered',async()=>{const f=fixture();await sendSummary(f.options);assert.equal(f.sent.length,1);assert.equal(f.sent[0].text,summaryText(f.manifest));assert.equal(f.sent[0].images,undefined);const source=f.db.get(10);assert.equal(source.conclusion,'neutral');assert.equal(receiptState(source),'superseded');const audit=JSON.parse(source.output.summary);assert.equal(audit.delivered.length,11);assert.equal(audit.replacedBySummary.suppressedBatches,25);assert.equal(f.db.get(20).conclusion,'success');await sendSummary(f.options);assert.equal(f.sent.length,1);});
test('uncertain send cannot replay summary or unlock original',async()=>{const f=fixture();await assert.rejects(sendSummary({...f.options,send:async()=>{throw new Error('transport');}}));await assert.rejects(sendSummary(f.options),/UNCERTAIN/);assert.equal(f.sent.length,0);assert.equal(f.db.get(10).conclusion,'action_required');});
test('definitively rejected summary can retry without resending old batches',async()=>{const f=fixture();await assert.rejects(sendSummary({...f.options,send:async()=>{throw Object.assign(new Error('rejected'),{definitelyNotSent:true});}}));await sendSummary(f.options);assert.equal(f.sent.length,1);});
test('checkpoint failure after Telegram success stops replay',async()=>{const f=fixture(),original=f.options.github;await assert.rejects(sendSummary({...f.options,github:async(p,i)=>{if(p==='/check-runs/20'&&i?.body.conclusion==='success')throw new Error('lost checkpoint');return original(p,i);}}));assert.equal(f.sent.length,1);await assert.rejects(sendSummary(f.options),/UNCERTAIN/);assert.equal(f.sent.length,1);});
test('failed source close retries only close, never sends second summary',async()=>{const f=fixture(),original=f.options.github;await assert.rejects(sendSummary({...f.options,github:async(p,i)=>{if(p==='/check-runs/10'&&i)throw new Error('close failed');return original(p,i);}}));assert.equal(f.db.get(20).conclusion,'success');await sendSummary(f.options);assert.equal(f.sent.length,1);assert.equal(f.db.get(10).conclusion,'neutral');});
test('changed source, target, plan and existing unrelated receipt block before sending',async()=>{for(const change of ['source','target','plan','receipt']){const f=fixture();if(change==='source')f.db.get(10).output.summary='{}';if(change==='target')f.options.target={...f.target,sha:'c'.repeat(40)};if(change==='plan')f.options.expectedHash='wrong';if(change==='receipt')f.db.set(20,{id:20,name:'Telegram deployment notice',app:{slug:'github-actions'},head_sha:f.target.sha,external_id:'200',status:'completed',conclusion:'success',output:{summary:'{}'}});await assert.rejects(sendSummary(f.options));assert.equal(f.sent.length,0);}});
test('neutral receipts without a valid summary replacement stay uncertain',()=>{assert.equal(receiptState({status:'completed',conclusion:'neutral'}),'uncertain');});
test('workflow exposes only summary recovery under main/prod shared lock',async()=>{const{readFileSync}=await import('node:fs');const{load}=await import('js-yaml');const w=load(readFileSync('.github/workflows/deployment-notices.yml','utf8')),j=w.jobs['summary-recovery'];assert.equal(w.jobs['partial-recovery'],undefined);assert.ok(!w.on.workflow_dispatch.inputs.operation.options.includes('resume-partial'));assert.match(j.if,/refs\/heads\/main/);assert.match(j.if,/inputs.environment == 'prod'/);assert.equal(j.concurrency.group,'telegram-production-notices');assert.equal(j.permissions.actions,'read');assert.equal(j.steps.at(-1).env.NOTICE_PLAN_HASH,'${{ inputs.plan_hash }}');});
test('direct summary sender sends exact text to fixed room and never retries network uncertainty',async()=>{const {sendSummaryTelegram}=await import('./send-deployment-summary.mjs');let count=0;const text=summaryText(summaryManifest);const result=await sendSummaryTelegram({text},'123:unit_test',async(url,init)=>{count++;assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),{chat_id:-5187701508,text,link_preview_options:{is_disabled:true}});return Response.json({ok:true,result:{chat:{id:-5187701508},message_id:123,text}});});assert.equal(result.messageId,123);assert.equal(count,1);count=0;await assert.rejects(sendSummaryTelegram({text},'123:unit_test',async()=>{count++;throw new Error('network');}),/UNCERTAIN/);assert.equal(count,1);await assert.rejects(sendSummaryTelegram({text},'',async()=>{throw new Error('must not send');}),/SECRET_REQUIRED/);});
test('only explicit Telegram rejection is retryable; ambiguous replies and wrong room remain blocked',async()=>{const {sendSummaryTelegram}=await import('./send-deployment-summary.mjs');for(const [status,body,retry] of [[429,{ok:false,error_code:429},true],[500,{ok:false,error_code:500},false],[200,{ok:true,result:{chat:{id:1},message_id:123,text:'test'}},false]]){await assert.rejects(sendSummaryTelegram({text:'test'},'123:unit_test',async()=>Response.json(body,{status})),error=>Boolean(error.definitelyNotSent)===retry);}});
test('1116 pinned manifest and plan use only fake GitHub reads',async()=>{
 const {loadSummaryManifest,main}=await import('./send-deployment-summary.mjs');
 const {readFileSync}=await import('node:fs');
 const manifest=loadSummaryManifest('deployment-notice-summary-1116.json');
 assert.throws(()=>loadSummaryManifest('../deployment-notice-summary-1116.json'),/UNKNOWN/);
 assert.equal(manifest.originalBatchHashes.length,22);
 assert.equal(manifest.notes.length,190);
 const messages=summaryMessages(manifest);
 assert.equal(messages.length,12);
 assert.match(messages.at(-1).text,/^외 174건/);
 const source=JSON.parse(readFileSync(new URL('./fixtures/deployment-notice-summary-1116-source.json',import.meta.url)));
 validateSource(source,manifest);
 assert.throws(()=>validateSource({...source,head_sha:manifest.baseSha},manifest),/INVALID_SOURCE/);
 const saved={...process.env},logs=[],log=console.log;
 try{
  process.env.NOTICE_SUMMARY_MANIFEST='deployment-notice-summary-1116.json';
  process.env.NOTICE_DEPLOYMENT_ID=String(manifest.targetDeploymentId);
  process.env.NOTICE_OPERATION='plan-summary';
  console.log=value=>logs.push(JSON.parse(value));
  await main({github:async(path,init)=>{
   assert.equal(init,undefined);
   if(path===`/check-runs/${source.id}`)return source;
   if(path===`/deployments/${manifest.targetDeploymentId}`)return {id:manifest.targetDeploymentId,sha:manifest.headSha};
   if(path===`/deployments/${manifest.targetDeploymentId}/statuses?per_page=100`)return [{}];
   throw Error('Unexpected fake GitHub read: '+path);
  },verifyDeployment:async()=>{},verifySources:()=>{}});
  assert.equal(logs.length,1);assert.equal(logs[0].planHash,summaryPlanHash(manifest));assert.deepEqual(logs[0].messages,messages);
  log('1116 local fake plan hash: '+logs[0].planHash);
 }finally{console.log=log;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

// 1116 per-change summary: one message per change, each with its one representative screenshot.
const perChange=loadSummaryManifest('deployment-notice-summary-1116.json');
const expectedImages=[null,'2026-11-16-follow-gleam-done-390','2026-11-16-missionbook-comments-390','2026-11-16-sns-followers-weekly','2026-11-16-email-activity-value','2026-11-16-youtube-shorts-1440','2026-11-16-passport-x-share-390','2026-11-15-fanpage-head-tabs-390-local','2026-11-15-board-thumbnails-390','2026-11-15-groups-banner-single-wide','2026-11-15-dukjil-tab-pc-layout',null].map(n=>n&&`release-notes/images/${n}.png`);
function perChangeFixture(){const f=fixture({...perChange,confirmedBatches:11,suppressedBatches:25});f.sent.length=0;let next=3000;f.options.expectedHash=summaryPlanHash(f.manifest);f.options.send=async body=>{f.sent.push(body);return {chatId:-5187701508,messageId:next++};};return f;}
test('1116 per-change messages keep order, captions and one mapped screenshot each',()=>{
 const messages=summaryMessages(perChange);
 assert.equal(messages.length,12);
 assert.deepEqual(messages[0],{text:'11/13~11/16 변경 안내'});
 assert.deepEqual(messages.slice(1,-1).map(m=>m.text),perChange.highlights.map(h=>h.text));
 assert.ok(messages.every(m=>!m.text.startsWith('•')&&!m.text.includes('\n')));
 assert.equal(messages.at(-1).text,'외 174건의 변경도 반영됐어요. (변경 안내 파일 기준)');
 assert.deepEqual(messages.map(m=>m.image?.path??null),expectedImages);
 assert.equal(perChange.highlights.flatMap(h=>h.paths).length,16);
 // 1113 stays one plain message with the unchanged plan hash.
 assert.deepEqual(summaryMessages(summaryManifest),[{text:summaryText(summaryManifest)}]);
 assert.equal(summaryPlanHash(summaryManifest),hash(summaryManifest));
 assert.throws(()=>summaryMessages({...perChange,highlights:[...perChange.highlights,{paths:[perChange.highlights[0].paths[0]],text:'중복 근거 줄이에요.'}]}),/INVALID_SUMMARY_SOURCES/);
});
test('plan hash binds every caption and screenshot hash',()=>{
 const planHash=summaryPlanHash(perChange),alter=(i,h)=>({...perChange,highlights:perChange.highlights.map((x,j)=>j===i?h(x):x)});
 assert.notEqual(summaryPlanHash(alter(1,h=>({...h,image:{...h.image,sha256:'0'.repeat(64)}}))),planHash);
 assert.notEqual(summaryPlanHash(alter(1,h=>({...h,text:h.text+' '}))),planHash);
 assert.notEqual(summaryPlanHash(alter(0,h=>({...h,image:perChange.highlights[1].image}))),planHash);
});
test('1116 screenshots must come from the line source notes with pinned bytes in an isolated Git fixture',()=>{
 const repository=mkdtempSync(join(tmpdir(),'notice-summary-images-'));
 const git=(...args)=>execFileSync('git',['-c','user.name=Notice test','-c','user.email=notice@example.invalid',...args],{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init','-q');git('commit','--allow-empty','-qm','base');
  const baseSha=git('rev-parse','HEAD');
  for(const path of [...perChange.notes.map(n=>n.path),...perChange.highlights.filter(h=>h.image).map(h=>h.image.path)]){
   const destination=join(repository,path);mkdirSync(dirname(destination),{recursive:true});
   copyFileSync(new URL('../'+path,import.meta.url),destination);
  }
  git('add','release-notes');git('commit','-qm','pinned release notes');
  const manifest={...perChange,baseSha,headSha:git('rev-parse','HEAD')};
  verifySummarySources(manifest,repository);
  const alter=(i,h)=>({...manifest,highlights:manifest.highlights.map((x,j)=>j===i?h(x):x)});
  assert.throws(()=>verifySummarySources(alter(1,h=>({...h,image:{...h.image,sha256:'0'.repeat(64)}})),repository),/SUMMARY_IMAGE_CHANGED/);
  assert.throws(()=>verifySummarySources(alter(1,h=>({...h,image:manifest.highlights[2].image})),repository),/SUMMARY_IMAGE_NOT_IN_SOURCE/);
 }finally{rmSync(repository,{recursive:true,force:true});}
});
test('per-change summary sends 12 messages in order once, checkpoints each and closes the source last',async()=>{
 const f=perChangeFixture(),patches=[],original=f.options.github;
 const result=await sendSummaryMessages({...f.options,github:async(p,i)=>{if(p==='/check-runs/20'&&i)patches.push(JSON.parse(i.body.output.summary).delivered?.length);return original(p,i);}});
 assert.equal(f.sent.length,12);
 assert.deepEqual(f.sent.map(b=>b.text),summaryMessages(f.manifest).map(m=>m.text));
 assert.deepEqual(f.sent.map(b=>b.photo??null),expectedImages.map(p=>p&&`https://raw.githubusercontent.com/kyaa-io/kyaa/${f.target.sha}/${p}`));
 assert.deepEqual(patches,[1,2,3,4,5,6,7,8,9,10,11,12]);
 const receipt=f.db.get(20),state=JSON.parse(receipt.output.summary);
 assert.equal(receipt.conclusion,'success');
 assert.deepEqual(state.messageIds,Array.from({length:12},(_,i)=>3000+i));
 assert.equal(state.messageId,3000);assert.equal(state.planHash,summaryPlanHash(f.manifest));
 assert.deepEqual(result.messageIds,state.messageIds);
 const source=f.db.get(10);assert.equal(receiptState(source),'superseded');
 assert.equal(JSON.parse(source.output.summary).replacedBySummary.receiptId,20);
 await sendSummaryMessages(f.options);assert.equal(f.sent.length,12);
});
test('per-change failure midway records what went out and never resends it',async()=>{
 const f=perChangeFixture(),send=f.options.send;
 await assert.rejects(sendSummaryMessages({...f.options,send:async body=>{if(f.sent.length===4)throw Object.assign(new Error('rejected'),{definitelyNotSent:true});return send(body);}}),/UNCERTAIN/);
 const receipt=f.db.get(20),state=JSON.parse(receipt.output.summary);
 assert.equal(receipt.conclusion,'action_required');
 assert.deepEqual(state.delivered.map(d=>d.index),[0,1,2,3]);
 assert.equal(f.db.get(10).conclusion,'action_required');
 await assert.rejects(sendSummaryMessages(f.options),/UNCERTAIN/);
 assert.equal(f.sent.length,4);
});
test('per-change transport uncertainty and lost checkpoint stop without replay',async()=>{
 for(const kind of ['transport','checkpoint']){
  const f=perChangeFixture(),original=f.options.github,send=f.options.send;
  const options=kind==='transport'?{...f.options,send:async body=>{if(f.sent.length===2)throw new Error('network');return send(body);}}:{...f.options,github:async(p,i)=>{if(p==='/check-runs/20'&&i&&JSON.parse(i.body.output.summary).delivered?.length===3)throw new Error('lost checkpoint');return original(p,i);}};
  await assert.rejects(sendSummaryMessages(options),/UNCERTAIN/);
  const count=f.sent.length;assert.equal(count,kind==='transport'?2:3);
  await assert.rejects(sendSummaryMessages(f.options),/UNCERTAIN/);
  assert.equal(f.sent.length,count);assert.equal(f.db.get(10).conclusion,'action_required');
 }
});
test('per-change rejection before any message may rerun; plan or receipt changes block before sending',async()=>{
 const f=perChangeFixture();
 await assert.rejects(sendSummaryMessages({...f.options,send:async()=>{throw Object.assign(new Error('rejected'),{definitelyNotSent:true});}}),/REJECTED/);
 assert.equal(f.db.get(20).conclusion,'failure');
 await sendSummaryMessages(f.options);assert.equal(f.sent.length,12);
 for(const change of ['plan','oldPlanHash','receipt']){
  const g=perChangeFixture();
  if(change==='plan')g.options.expectedHash=hash(g.manifest);
  if(change==='oldPlanHash')g.options.manifest={...g.manifest,highlights:g.manifest.highlights.map((h,i)=>i===1?{...h,image:{...h.image,sha256:'0'.repeat(64)}}:h)};
  if(change==='receipt')g.db.set(20,{id:20,name:'Telegram deployment notice',app:{slug:'github-actions'},head_sha:g.target.sha,external_id:'200',status:'completed',conclusion:'failure',output:{summary:JSON.stringify({planHash:summaryPlanHash(g.manifest),replacesSourceReceiptId:10,deploymentId:200,messages:summaryMessages(g.manifest).slice(1),delivered:[],definitelyNotSent:true})}});
  await assert.rejects(sendSummaryMessages(g.options));assert.equal(g.sent.length,0);
 }
});
test('summary sender posts one screenshot with the line as caption, checks the echo, and refuses foreign photo URLs',async()=>{
 const text=perChange.highlights[1].text,photo=`https://raw.githubusercontent.com/kyaa-io/kyaa/${perChange.headSha}/${perChange.highlights[1].image.path}`;let calls=[];
 const result=await sendSummaryTelegram({text,photo},'123:unit_test',async(url,init)=>{calls.push(url);assert.deepEqual(JSON.parse(init.body),{chat_id:-5187701508,photo,caption:text,show_caption_above_media:true});return Response.json({ok:true,result:{chat:{id:-5187701508},message_id:77,caption:text,photo:[{file_id:'x'}]}});});
 assert.equal(result.messageId,77);assert.match(calls[0],/\/sendPhoto$/);
 await assert.rejects(sendSummaryTelegram({text,photo},'123:unit_test',async()=>Response.json({ok:true,result:{chat:{id:-5187701508},message_id:78,caption:'다른 글',photo:[]}})),/UNCERTAIN/);
 calls=[];
 await assert.rejects(sendSummaryTelegram({text,photo:'https://example.com/a.png'},'123:unit_test',async u=>{calls.push(u);}),e=>e.definitelyNotSent===true);
 assert.equal(calls.length,0);
});

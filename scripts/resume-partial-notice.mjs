import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CHECK_NAME, createGithubClient, readNotes, noticeBatches, verifyAwsNotice, sendNoticeRequest } from './deployment-notices.mjs';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const payload = batch => ({text:batch.text,images:batch.images ?? []});
const idsValid = batch => Number.isSafeInteger(batch.messageId) && batch.messageId > 0 && Array.isArray(batch.messageIds) && batch.messageIds.includes(batch.messageId) && batch.messageIds.every(id=>Number.isSafeInteger(id)&&id>0);
export function planPartial(receipt, batches, targetId) {
 const prior=JSON.parse(receipt.output.summary);
 if(receipt.status!=='completed'||receipt.conclusion!=='action_required'||prior.deploymentId!==Number(receipt.external_id)||!prior.delivered?.length||prior.batchCount!==batches.length||prior.delivered.length>=batches.length) throw new Error('INVALID_PARTIAL_RECEIPT');
 // This endpoint code is emitted before any Telegram request, unlike transport failures.
 if(prior.reason!=='DEPLOYMENT_VERIFICATION_UNAVAILABLE') throw new Error('UNCERTAIN_BATCH_REQUIRES_INSPECTION');
 const hashes=batches.map(batch=>hash(payload(batch)));
 if(new Set(hashes).size!==hashes.length) throw new Error('DUPLICATE_BATCH_HASH');
 prior.delivered.forEach((batch,i)=>{if(!idsValid(batch)||hash(payload(batch))!==hashes[i])throw new Error('CONFIRMED_BATCH_MISMATCH');});
 const plan={sourceReceiptId:receipt.id,sourceDeploymentId:prior.deploymentId,targetId,receiptHash:hash(receipt.output.summary),hashes,confirmed:prior.delivered.length};
 return {...plan,planHash:hash(plan)};
}
export async function resumePartial({github,source,target,batches,plan,expectedHash,send}) {
 if(plan.sourceReceiptId!==source.id||plan.targetId!==target.id||plan.hashes.length!==batches.length||batches.some((b,i)=>hash(payload(b))!==plan.hashes[i]))throw new Error('PLAN_BATCH_MISMATCH');
 if(expectedHash!==plan.planHash) throw new Error('PLAN_HASH_MISMATCH');
 const fresh=await github(`/check-runs/${source.id}`);
 const finalized= fresh.status==='completed' && fresh.conclusion==='success' && JSON.parse(fresh.output.summary).recovery?.plan?.planHash===plan.planHash;
 if(!finalized&&(hash(fresh.output.summary)!==plan.receiptHash||fresh.status!=='completed'||fresh.conclusion!=='action_required')) throw new Error('SOURCE_RECEIPT_CHANGED');
 const checks=[];
 for(let page=1;;page++){
  const result=await github(`/commits/${target.sha}/check-runs?filter=all&per_page=100&page=${page}`);
  checks.push(...result.check_runs.filter(r=>r.name===CHECK_NAME&&r.app?.slug==='github-actions'&&r.external_id===String(target.id)));
  if(result.check_runs.length<100)break;
 }
 if(checks.length>1)throw new Error('MULTIPLE_NOTICE_RECEIPTS_REQUIRE_REVIEW');
 let receipt=checks[0], state={partialRecovery:plan,delivered:[],pending:null};
 if(receipt){
  if(!['in_progress','completed'].includes(receipt.status)||(receipt.status==='completed'&&receipt.conclusion!=='failure')||receipt.head_sha!==target.sha)throw new Error('INVALID_TARGET_RECEIPT');
  const saved=JSON.parse(receipt.output.summary);
  if(saved.partialRecovery?.planHash!==plan.planHash)throw new Error('TARGET_RECEIPT_CONFLICT');
  state=saved;
  if(state.pending!==null)throw new Error('UNCERTAIN_BATCH_REQUIRES_INSPECTION');
  if(!Array.isArray(state.delivered)||state.delivered.length>batches.length-plan.confirmed)throw new Error('INVALID_RECOVERY_PROGRESS');
  state.delivered.forEach((b,i)=>{if(b.hash!==plan.hashes[plan.confirmed+i]||!idsValid(b))throw new Error('RECOVERY_HASH_MISMATCH');});
 }
 if(finalized&&(!receipt||state.delivered.length!==batches.length-plan.confirmed))throw new Error('FINALIZATION_STATE_MISMATCH');
 const output=()=>({title:'Partial notice recovery',summary:JSON.stringify(state)});
 if(!receipt)receipt=await github('/check-runs',{method:'POST',body:{name:CHECK_NAME,head_sha:target.sha,external_id:String(target.id),status:'in_progress',output:output()}});
 const save=()=>github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'in_progress',output:output()}});
 for(let i=plan.confirmed+state.delivered.length;i<batches.length;i++){
  state.pending=plan.hashes[i]; await save(); // Persist intent before POST; a crash must never cause replay.
  let result;
  try{result=await send({deploymentId:target.id,receiptId:receipt.id,...payload(batches[i])});}
  catch(error){
   if(error.definitelyNotSent){state.pending=null;await save();}
   throw error;
  }
  const record={hash:plan.hashes[i],messageId:result.messageId,messageIds:result.messageIds??[result.messageId]};
  if(!idsValid(record))throw new Error('UNCERTAIN_BATCH_REQUIRES_INSPECTION');
  state.delivered.push(record);state.pending=null;await save();
 }
 const prior=JSON.parse(source.output.summary);
 if(!finalized)await github(`/check-runs/${source.id}`,{method:'PATCH',body:{status:'completed',conclusion:'success',output:{title:'All original batches delivered after recovery',summary:JSON.stringify({...prior,recovery:{plan,targetDeploymentId:target.id,receiptId:receipt.id,delivered:state.delivered},messageId:prior.delivered[0].messageId,messageIds:[...prior.delivered,...state.delivered].flatMap(b=>b.messageIds),chatId:-5187701508})}}});
 // This target has carried historical batches only; its own changes remain unannounced.
 await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'completed',conclusion:'failure',output:output()}});
 return {recovered:state.delivered.length,sourceReceiptId:source.id,targetReceiptId:receipt.id};
}
async function main(){
 const github=createGithubClient({token:process.env.GITHUB_TOKEN});
 const sourceId=Number(process.env.NOTICE_SOURCE_RECEIPT_ID),targetId=Number(process.env.NOTICE_DEPLOYMENT_ID);
 if(![sourceId,targetId].every(id=>Number.isSafeInteger(id)&&id>0))throw new Error('INVALID_RECOVERY_IDS');
 const source=await github(`/check-runs/${sourceId}`);
 const deployment=await github(`/deployments/${source.external_id}`);
 const target=await github(`/deployments/${Number(process.env.NOTICE_DEPLOYMENT_ID)}`);
 if(source.name!==CHECK_NAME||source.app?.slug!=='github-actions'||source.head_sha!==deployment.sha||deployment.environment!=='AWS production'||deployment.creator?.login!=='github-actions[bot]'||deployment.payload?.publicLive!==true||target.id<=deployment.id)throw new Error('INVALID_SOURCE_RECEIPT');
 const [status]=await github(`/deployments/${target.id}/statuses?per_page=100`);
 await verifyAwsNotice(target,status,github);
 const prior=JSON.parse(source.output.summary);
 const statuses=await github(`/deployments/${deployment.id}/statuses?per_page=100`);
 const notes=readNotes(prior.base,deployment.sha);
 readNotes(deployment.sha,target.sha); // Require ancestry and immutable release notes.
 const candidates=statuses.filter(s=>s.state==='success'&&s.creator?.login==='github-actions[bot]').map(s=>noticeBatches(notes,s.created_at));
 const batches=candidates.find(b=>hash(payload(b[0]))===hash(payload(prior.delivered[0])));
 if(!batches)throw new Error('ORIGINAL_BATCHES_NOT_REPRODUCIBLE');
 const plan=prior.recovery?.plan??planPartial(source,batches,target.id);
 if(plan.targetId!==target.id||plan.hashes.length!==batches.length||batches.some((b,i)=>hash(payload(b))!==plan.hashes[i]))throw new Error('PLAN_BATCH_MISMATCH');
 console.log(JSON.stringify(plan));
 if(process.env.NOTICE_OPERATION==='plan-partial')return;
 if(process.env.NOTICE_OPERATION!=='resume-partial')throw new Error('INVALID_OPERATION');
 console.log(JSON.stringify(await resumePartial({github,source,target,batches,plan,expectedHash:process.env.NOTICE_PLAN_HASH,send:body=>sendNoticeRequest(body,process.env.TELEGRAM_BUG_REPORT_OPERATOR_SECRET)})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});

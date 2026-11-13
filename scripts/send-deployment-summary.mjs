import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CHECK_NAME, createGithubClient, verifyAwsNotice } from './deployment-notices.mjs';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const summaryManifest = JSON.parse(readFileSync(new URL('./deployment-notice-summary-1113.json', import.meta.url)));
export function summaryText(manifest) {
 const paths=manifest.highlights.map(h=>h.path);
 if(new Set(paths).size!==paths.length||paths.some(p=>!manifest.notes.some(n=>n.path===p)))throw new Error('INVALID_SUMMARY_SOURCES');
 const text=['[운영] 11/11~11/13 변경 안내',...manifest.highlights.map(h=>'• '+h.text),`외 ${manifest.notes.length-paths.length}건의 변경도 반영됐어요. (변경 안내 파일 기준)`].join('\n');
 if(text.split('\n').length>10||text.length>3900)throw new Error('SUMMARY_TOO_LONG');
 return text;
}
export function verifySummarySources(manifest) {
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
 git('merge-base','--is-ancestor',manifest.baseSha,manifest.headSha);
 const entries=git('diff','--name-status','--no-renames',manifest.baseSha,manifest.headSha,'--','release-notes/*.json').trim().split('\n');
 if(JSON.stringify(entries)!==JSON.stringify(manifest.notes.map(n=>'A\t'+n.path)))throw new Error('SUMMARY_NOTE_SET_CHANGED');
 for(const n of manifest.notes){if(createHash('sha256').update(git('show',`${manifest.headSha}:${n.path}`)).digest('hex')!==n.sha256)throw new Error('SUMMARY_NOTE_CHANGED');}
}
export function validateSource(source, manifest) {
 if(source.id!==manifest.sourceReceiptId||source.name!==CHECK_NAME||source.app?.slug!=='github-actions'||source.external_id!==String(manifest.sourceDeploymentId)||source.head_sha!==manifest.baseSha)throw new Error('INVALID_SOURCE_RECEIPT');
 const prior=JSON.parse(source.output.summary);
 if(source.status==='completed'&&source.conclusion==='neutral'&&prior.replacedBySummary?.planHash===hash(manifest))return prior;
 if(source.status!=='completed'||source.conclusion!=='action_required'||hash(source.output.summary)!==manifest.sourceReceiptHash)throw new Error('SOURCE_RECEIPT_CHANGED');
 if(prior.delivered.length!==manifest.confirmedBatches||prior.batchCount!==manifest.originalBatchHashes.length||prior.batchCount-prior.delivered.length!==manifest.suppressedBatches)throw new Error('PARTIAL_COUNTS_CHANGED');
 prior.delivered.forEach((b,i)=>{if(hash({text:b.text,images:b.images??[]})!==manifest.originalBatchHashes[i]||!validIds(b))throw new Error('CONFIRMED_BATCH_MISMATCH');});
 return prior;
}
const validIds = b => Number.isSafeInteger(b.messageId)&&b.messageId>0&&Array.isArray(b.messageIds)&&b.messageIds.includes(b.messageId)&&b.messageIds.every(id=>Number.isSafeInteger(id)&&id>0);
export async function sendSummary({github,target,manifest=summaryManifest,expectedHash,send}) {
 const planHash=hash(manifest),text=summaryText(manifest);
 if(expectedHash!==planHash||target.id!==manifest.targetDeploymentId||target.sha!==manifest.headSha)throw new Error('SUMMARY_PLAN_MISMATCH');
 const source=await github(`/check-runs/${manifest.sourceReceiptId}`),prior=validateSource(source,manifest);
 const matches=[];
 for(let page=1;;page++){
  const list=await github(`/commits/${target.sha}/check-runs?filter=all&per_page=100&page=${page}`);
  matches.push(...list.check_runs.filter(r=>r.name===CHECK_NAME&&r.app?.slug==='github-actions'&&r.external_id===String(target.id)));
  if(list.check_runs.length<100)break;
 }
 if(matches.length>1)throw new Error('MULTIPLE_NOTICE_RECEIPTS_REQUIRE_REVIEW');
 let receipt=matches[0],state={planHash,replacesSourceReceiptId:source.id,deploymentId:target.id,text};
 if(receipt){
  if(receipt.head_sha!==target.sha)throw new Error('INVALID_TARGET_RECEIPT');
  state=JSON.parse(receipt.output.summary);
  if(state.planHash!==planHash||state.text!==text||state.replacesSourceReceiptId!==source.id||state.deploymentId!==target.id)throw new Error('TARGET_RECEIPT_CONFLICT');
  if(receipt.status==='completed'&&receipt.conclusion==='success'){
   if(!validIds(state)||state.chatId!==-5187701508)throw new Error('INVALID_DELIVERY_RECEIPT');
  }else if(receipt.status!=='completed'||receipt.conclusion!=='failure'||state.definitelyNotSent!==true)throw new Error('SUMMARY_DELIVERY_UNCERTAIN');
 }
 if(prior.replacedBySummary&&(!receipt||receipt.conclusion!=='success'||prior.replacedBySummary.receiptId!==receipt.id))throw new Error('REPLACEMENT_RECEIPT_MISMATCH');
 if(!receipt||receipt.conclusion!=='success'){
  const claim={name:CHECK_NAME,head_sha:target.sha,external_id:String(target.id),status:'in_progress',output:{title:'One summary reserved; never replay an uncertain POST',summary:JSON.stringify({...state,definitelyNotSent:false})}};
  receipt=receipt?await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:claim}):await github('/check-runs',{method:'POST',body:claim});
  let result;
  try{result=await send({deploymentId:target.id,receiptId:receipt.id,text});}
  catch(error){
   if(error.definitelyNotSent)await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'completed',conclusion:'failure',output:{title:'Summary definitively not sent',summary:JSON.stringify({...state,definitelyNotSent:true})}}});
   throw error;
  }
  state={...state,definitelyNotSent:false,chatId:result.chatId,messageId:result.messageId,messageIds:result.messageIds??[result.messageId]};
  if(!validIds(state)||state.chatId!==-5187701508)throw new Error('SUMMARY_DELIVERY_UNCERTAIN');
  await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'completed',conclusion:'success',output:{title:'Approved production summary delivered once',summary:JSON.stringify(state)}}});
 }
 // Close the old partial receipt only after the replacement is durably confirmed.
 if(!prior.replacedBySummary)await github(`/check-runs/${source.id}`,{method:'PATCH',body:{status:'completed',conclusion:'neutral',output:{title:'Partially delivered; remaining batches replaced by approved summary',summary:JSON.stringify({...prior,replacedBySummary:{planHash,deploymentId:target.id,receiptId:receipt.id,messageId:state.messageId,chatId:state.chatId,suppressedBatches:manifest.suppressedBatches,decision:manifest.decision}})}}});
 return {messageId:state.messageId,sourceDisposition:'partially_delivered_summary_replaced'};
}
export async function sendSummaryTelegram(body, token, fetcher=fetch) {
 if(!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token??''))throw new Error('SUMMARY_BOT_SECRET_REQUIRED');
 let response,result;
 try {
  response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:-5187701508,text:body.text,link_preview_options:{is_disabled:true}}),redirect:'error',signal:AbortSignal.timeout(75000)});
  result=await response.json();
 }catch{throw new Error('SUMMARY_DELIVERY_UNCERTAIN');}
 if(!response.ok||result.ok!==true){
  const definitelyNotSent=result.ok===false&&[400,401,403,429].includes(response.status)&&result.error_code===response.status;
  throw Object.assign(new Error(definitelyNotSent?'SUMMARY_REJECTED':'SUMMARY_DELIVERY_UNCERTAIN'),{definitelyNotSent});
 }
 if(result.result?.chat?.id!==-5187701508||result.result.text!==body.text||!Number.isSafeInteger(result.result.message_id)||result.result.message_id<=0)throw new Error('SUMMARY_DELIVERY_UNCERTAIN');
 return {chatId:-5187701508,messageId:result.result.message_id};
}
async function main(){
 const manifest=summaryManifest;
 if(Number(process.env.NOTICE_DEPLOYMENT_ID)!==manifest.targetDeploymentId)throw new Error('SUMMARY_TARGET_MISMATCH');
 verifySummarySources(manifest);
 const github=createGithubClient({token:process.env.GITHUB_TOKEN});
 const target=await github(`/deployments/${manifest.targetDeploymentId}`),[status]=await github(`/deployments/${manifest.targetDeploymentId}/statuses?per_page=100`);
 if(target.sha!==manifest.headSha)throw new Error('SUMMARY_TARGET_MISMATCH');
 await verifyAwsNotice(target,status,github);
 validateSource(await github(`/check-runs/${manifest.sourceReceiptId}`),manifest);
 console.log(JSON.stringify({planHash:hash(manifest),text:summaryText(manifest),suppressedBatches:manifest.suppressedBatches}));
 if(process.env.NOTICE_OPERATION==='plan-summary')return;
 if(process.env.NOTICE_OPERATION!=='send-summary')throw new Error('INVALID_OPERATION');
 if(!/^[0-9]+:[A-Za-z0-9_-]+$/.test(process.env.TELEGRAM_BUG_REPORT_BOT_TOKEN??''))throw new Error('SUMMARY_BOT_SECRET_REQUIRED');
 console.log(JSON.stringify(await sendSummary({github,target,expectedHash:process.env.NOTICE_PLAN_HASH,send:body=>sendSummaryTelegram(body,process.env.TELEGRAM_BUG_REPORT_BOT_TOKEN)})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});

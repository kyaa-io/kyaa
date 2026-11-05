import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createGithubClient, receiptState, REPOSITORY, REPOSITORY_ID, sendNoticeRequest, readNotes} from './deployment-notices.mjs';
export const DEV_CHECK_NAME='Telegram deployment notice · DEV';
export const DEV_ORIGIN='https://dev.kyaa.io';
export function eligibleDevDeployment(deployment,status){
 const p=deployment?.payload;
 return Number.isSafeInteger(deployment?.id)&&/^[a-f0-9]{40}$/.test(deployment.sha??'')&&deployment.environment==='AWS dev'&&deployment.creator?.login==='github-actions[bot]'&&status?.state==='success'&&status.environment==='AWS dev'&&status.creator?.login==='github-actions[bot]'&&status.environment_url===DEV_ORIGIN&&p&&Object.keys(p).length===9&&Object.keys(p).every(k=>['provider','schemaVersion','environment','sourceSha','imageDigest','sourceRunId','workflowRunId','workflowPath','publicLive'].includes(k))&&p.provider==='aws'&&p.schemaVersion===1&&p.environment==='dev'&&p.sourceSha===deployment.sha&&/^sha256:[a-f0-9]{64}$/.test(p.imageDigest??'')&&Number.isSafeInteger(p.workflowRunId)&&p.workflowRunId>0&&p.sourceRunId===p.workflowRunId&&p.workflowPath==='.github/workflows/aws-platform.yml'&&p.publicLive===false&&status.log_url===`https://github.com/${REPOSITORY}/actions/runs/${p.workflowRunId}`;
}
export const DEV_NOTICE_LIMIT=3900;
export function formatDevNotice(notes,completedAt){
 const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(completedAt));
 // Each change records every note it appears in. With no summary the links match the old output exactly; with one, only links of shown changes remain.
 const items=[],byChange=new Map(),allLinks=[...new Set(notes.map(n=>DEV_ORIGIN+n.path))];
 for(const n of notes)for(const c of n.changes){const link=DEV_ORIGIN+n.path;if(byChange.has(c))byChange.get(c).links.add(link);else{const item={change:c,links:new Set([link])};byChange.set(c,item);items.push(item);}}
 const render=count=>{
  const shown=items.slice(0,count),omitted=items.length-count,links=omitted>0?[...new Set(shown.flatMap(i=>[...i.links]))]:allLinks;
  const lines=shown.map(i=>'• '+i.change);
  if(omitted>0)lines.push(`• 외 ${omitted}건`);
  return `[DEV 반영] kyaa 수정사항이 반영됐어요\n\n${lines.length?lines.join('\n'):'• 현재 버전을 개발 환경에 반영했어요.'}\n\n확인하기\n${links.length?links.join('\n'):DEV_ORIGIN+'/'}\n\n반영 시각: ${time} (한국 시간)`;
 };
 // Longest prefix of whole changes that fits; never cut a change mid-sentence, never exceed the limit.
 for(let count=items.length;count>=0;count--){const text=render(count);if(text.length<=DEV_NOTICE_LIMIT)return text;}
 throw new Error('DEV_NOTICE_TOO_LONG');
}
export async function notifyDevDeployment({event,github,send,fetcher=fetch,notes=readNotes}){
 if(event.repository?.id!==REPOSITORY_ID||event.repository.full_name!==REPOSITORY||!eligibleDevDeployment(event.deployment,event.deployment_status))throw new Error('UNTRUSTED_DEV_DEPLOYMENT');
 const d=await github(`/deployments/${event.deployment.id}`),[status]=await github(`/deployments/${event.deployment.id}/statuses?per_page=1`);
 if(!eligibleDevDeployment(d,status)||d.sha!==event.deployment.sha)throw new Error('DEV_DEPLOYMENT_NO_LONGER_SUCCESSFUL');
 const run=await github(`/actions/runs/${d.payload.workflowRunId}`);
 if(run.repository?.id!==REPOSITORY_ID||run.repository.full_name!==REPOSITORY||run.id!==d.payload.workflowRunId||run.head_sha!==d.sha||run.head_branch!=='main'||run.path!==d.payload.workflowPath||!['in_progress','completed'].includes(run.status)||(run.status==='completed'&&run.conclusion!=='success')||!['push','workflow_dispatch'].includes(run.event))throw new Error('UNTRUSTED_DEV_WORKFLOW');
 const health=await fetcher(DEV_ORIGIN+'/api/health/live',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)}),live=await health.json();
 if(!health.ok||live.status!=='ok'||live.revision!==d.sha)throw new Error('DEV_RELEASE_NOT_LIVE');
 const matches=[];
 for(let page=1;;page++){const list=await github(`/commits/${d.sha}/check-runs?check_name=${encodeURIComponent(DEV_CHECK_NAME)}&filter=all&per_page=100&page=${page}`);matches.push(...list.check_runs.filter(c=>c.name===DEV_CHECK_NAME&&c.app?.slug==='github-actions'&&c.external_id===String(d.id)));if(list.check_runs.length<100)break;}
 if(matches.length>1)throw new Error('MULTIPLE_DEV_NOTICE_RECEIPTS_REQUIRE_REVIEW');
 const existing=matches[0],state=receiptState(existing);
 if(state==='sent')return {skipped:'already_sent'};
 if(state==='uncertain')throw new Error('NOTICE_DELIVERY_UNCERTAIN');
 // Compare deployments, not individual commits: a single release may contain many commits.
 let base;
 for(let page=1;!base;page++){
  const candidates=await github(`/deployments?environment=AWS%20dev&per_page=100&page=${page}`);
  if(!candidates.length)throw new Error('DEV_NOTICE_BASELINE_NOT_FOUND');
  for(const candidate of candidates){
   if(candidate.id>=d.id||candidate.environment!=='AWS dev')continue;
   const [priorStatus]=await github(`/deployments/${candidate.id}/statuses?per_page=1`);
   if(eligibleDevDeployment(candidate,priorStatus)){base=candidate.sha;break;}
  }
 }
 const text=formatDevNotice(notes(base,d.sha),status.created_at);
 const claim={name:DEV_CHECK_NAME,head_sha:d.sha,external_id:String(d.id),status:'in_progress',details_url:status.log_url,output:{title:'DEV Telegram delivery reserved',summary:'Do not retry an uncertain delivery.'}};
 const receipt=existing?await github(`/check-runs/${existing.id}`,{method:'PATCH',body:{status:claim.status,output:claim.output}}):await github('/check-runs',{method:'POST',body:claim});
 try{
  const result=await send({site:'dev',deploymentId:d.id,receiptId:receipt.id,text});
  await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'completed',conclusion:'success',output:{title:'DEV notice delivered',summary:JSON.stringify({deploymentId:d.id,messageId:result.messageId,chatId:result.chatId,text})}}});
  return {sent:true,deploymentId:d.id,messageId:result.messageId};
 }catch(error){
  await github(`/check-runs/${receipt.id}`,{method:'PATCH',body:{status:'completed',conclusion:error.definitelyNotSent?'failure':'action_required',output:{title:'DEV notice requires inspection',summary:JSON.stringify({deploymentId:d.id,reason:error.noticeCode??'NOTICE_DELIVERY_UNCERTAIN'})}}}).catch(()=>{});
  throw new Error(error.definitelyNotSent?(error.noticeCode??'NOTICE_REJECTED'):'NOTICE_DELIVERY_UNCERTAIN');
 }
}
async function main(){
 if(!process.env.GITHUB_TOKEN||!process.env.TELEGRAM_BUG_REPORT_OPERATOR_SECRET)throw new Error('NOTICE_CREDENTIALS_MISSING');
 const event=JSON.parse(readFileSync(process.env.DEPLOYMENT_NOTICE_EVENT_PATH,'utf8'));
 console.log(JSON.stringify(await notifyDevDeployment({event,github:createGithubClient({token:process.env.GITHUB_TOKEN}),send:body=>sendNoticeRequest(body,process.env.TELEGRAM_BUG_REPORT_OPERATOR_SECRET,fetch,DEV_ORIGIN)})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});

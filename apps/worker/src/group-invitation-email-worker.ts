import {createDecipheriv,createHash} from 'node:crypto';
import {SESv2Client,SendEmailCommand} from '@aws-sdk/client-sesv2';
import {z} from 'zod';
import {createWorkerClient} from './data-client.js';
import type {NotificationWorkerEnv} from './notification-env.js';
const jobSchema=z.object({id:z.uuid(),invitationId:z.uuid(),pageId:z.uuid(),attemptToken:z.uuid(),email:z.email().max(254),tokenEncrypted:z.string().max(512),tokenHash:z.string().regex(/^[a-f0-9]{64}$/),origin:z.enum(['https://dev.kyaa.io','https://kyaa.io']),locale:z.enum(['ko','en']),pageName:z.string().max(100)}).strict();
export type GroupInvitationJob=z.infer<typeof jobSchema>;
export type GroupInvitationOutcome='sent'|'throttled'|'rejected'|'unknown';
export interface GroupInvitationQueue{claim():Promise<GroupInvitationJob|null>;begin(job:GroupInvitationJob):Promise<boolean>;finish(job:GroupInvitationJob,outcome:GroupInvitationOutcome,providerId?:string):Promise<void>}
export interface GroupInvitationSender{send(job:GroupInvitationJob):Promise<string>}
export class GroupInvitationSendError extends Error{constructor(readonly outcome:Exclude<GroupInvitationOutcome,'sent'>){super('GROUP_INVITATION_'+outcome.toUpperCase());}}
export function readGroupInvitationToken(job:GroupInvitationJob,keyHex:string){
 try{
  if(!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error();
  const [version,nonce,tag,ciphertext,...extra]=job.tokenEncrypted.split('.');
  if(version!=='v1'||!nonce||!tag||!ciphertext||extra.length||Buffer.from(nonce,'base64url').length!==12||Buffer.from(tag,'base64url').length!==16)throw new Error();
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),Buffer.from(nonce,'base64url'));
  decipher.setAAD(Buffer.from(JSON.stringify(['group-invitation:v1',job.invitationId,job.pageId])));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  const token=Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
  if(!/^[a-f0-9]{64}$/.test(token)||createHash('sha256').update(token).digest('hex')!==job.tokenHash)throw new Error();return token;
 }catch{throw new GroupInvitationSendError('rejected');}
}
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function renderGroupInvitationEmail(job:GroupInvitationJob,token:string){
 const link=`${job.origin}/groups/invitations/${job.invitationId}?locale=${job.locale}#token=${token}`;
 const subject=job.locale==='ko'?`[kyaa] ${job.pageName} 모임 초대`:`[kyaa] Invitation to ${job.pageName}`;
 const note=job.locale==='ko'?'본인이 가입과 개인정보 처리에 동의한 뒤 팬 등록이 완료됩니다. 초대는 7일 동안 유효합니다.':'Membership is completed only after you agree to join and acknowledge the privacy policy. This invitation expires in 7 days.';
 const action=job.locale==='ko'?'초대 확인하기':'View invitation';
 return {subject,text:`${subject}\n\n${note}\n\n${action}\n${link}`,html:`<p>${escape(subject)}</p><p>${escape(note)}</p><p><a href="${escape(link)}">${escape(action)}</a></p>`};
}
export class GroupInvitationEmailWorker{
 constructor(private readonly queue:GroupInvitationQueue,private readonly sender:GroupInvitationSender){}
 async runOnce(){const job=await this.queue.claim();if(!job||!await this.queue.begin(job))return 0;let providerId:string;
  try{providerId=await this.sender.send(job);if(!providerId)throw new GroupInvitationSendError('unknown');}
  catch(error){await this.queue.finish(job,error instanceof GroupInvitationSendError?error.outcome:'unknown');return 0;}
  // An ack failure never re-enters the provider-send branch.
  await this.queue.finish(job,'sent',providerId);return 1;
 }
}
type Rpc={rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>};
export class GroupInvitationEmailQueue implements GroupInvitationQueue{
 constructor(private readonly db:Rpc,private readonly environment:'dev'|'prod'){}
 async call(name:string,args?:Record<string,unknown>){const {data,error}=await this.db.rpc(name,args);if(error)throw new Error('GROUP_INVITATION_QUEUE_UNAVAILABLE');return data;}
 async claim(){const value=await this.call('claim_group_invitation_email',{p_environment:this.environment});return value===null?null:jobSchema.parse(value);}
 async begin(job:GroupInvitationJob){return await this.call('begin_group_invitation_email_send',{p_id:job.id,p_token:job.attemptToken})===true;}
 async finish(job:GroupInvitationJob,outcome:GroupInvitationOutcome,providerId?:string){if(await this.call('finish_group_invitation_email_send',{p_id:job.id,p_token:job.attemptToken,p_outcome:outcome,p_provider_id:providerId??null})!==true)throw new Error('GROUP_INVITATION_STALE_ATTEMPT');}
}
type SesClient={send(command:SendEmailCommand):Promise<{MessageId?:string}>};
export class SesGroupInvitationSender implements GroupInvitationSender{
 constructor(private readonly keyHex:string,private readonly environment:'dev'|'prod',private readonly client:SesClient=new SESv2Client({region:'ap-northeast-2',maxAttempts:1,requestHandler:{connectionTimeout:2000,requestTimeout:8000,throwOnRequestTimeout:true}}),private readonly fromEmail='notifications@kyaa.io'){}
 async send(job:GroupInvitationJob){
  if(job.origin!==(this.environment==='dev'?'https://dev.kyaa.io':'https://kyaa.io')||!['notifications@kyaa.io','notifications@byus.kr'].includes(this.fromEmail))throw new GroupInvitationSendError('rejected');
  const body=renderGroupInvitationEmail(job,readGroupInvitationToken(job,this.keyHex));let response:{MessageId?:string};
  try{response=await this.client.send(new SendEmailCommand({FromEmailAddress:this.fromEmail,Destination:{ToAddresses:[job.email]},Content:{Simple:{Subject:{Data:body.subject,Charset:'UTF-8'},Body:{Text:{Data:body.text,Charset:'UTF-8'},Html:{Data:body.html,Charset:'UTF-8'}}}}}));}
  catch(error){const name=error&&typeof error==='object'&&'name'in error?String(error.name):'';
   if(['TooManyRequestsException','ThrottlingException','Throttling'].includes(name))throw new GroupInvitationSendError('throttled');
   if(['AccessDeniedException','AccountSuspendedException','BadRequestException','MailFromDomainNotVerifiedException','MessageRejected','NotFoundException'].includes(name))throw new GroupInvitationSendError('rejected');
   throw new GroupInvitationSendError('unknown');
  }
  if(typeof response.MessageId!=='string'||!response.MessageId.trim()||response.MessageId.length>200)throw new GroupInvitationSendError('unknown');return response.MessageId;
 }
}
export async function runGroupInvitationEmailOnce(env:NotificationWorkerEnv,client?:SesClient){
 if(env.GROUP_INVITATION_EMAIL_MODE==='disabled')return 0;
 const environment=env.NOTIFICATION_EXTERNAL_ENVIRONMENT;if(environment!=='dev'&&environment!=='prod')throw new Error('GROUP_INVITATION_ENVIRONMENT_INVALID');
 const db=createWorkerClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,env,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}}),queue=new GroupInvitationEmailQueue(db,environment);
 const sender=env.GROUP_INVITATION_EMAIL_MODE==='test_sink'?{send:async(job:GroupInvitationJob)=>{
  if(environment!=='dev'||job.origin!=='https://dev.kyaa.io')throw new GroupInvitationSendError('rejected');
  const body=renderGroupInvitationEmail(job,readGroupInvitationToken(job,env.GROUP_INVITATION_TOKEN_KEY!));
  const result=await queue.call('record_group_invitation_email_test_sink',{p_id:job.id,p_token:job.attemptToken,p_payload_hash:createHash('sha256').update(body.text).digest('hex')});
  if(typeof result!=='string')throw new GroupInvitationSendError('unknown');return result;
 }}:new SesGroupInvitationSender(env.GROUP_INVITATION_TOKEN_KEY!,environment,client,env.SES_FROM_EMAIL!);
 return new GroupInvitationEmailWorker(queue,sender).runOnce();
}

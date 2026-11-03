import 'server-only';
import {z} from 'zod';
import {AuthError} from '@/features/auth/domain/auth-errors';
import type {FanpageDependencies} from '@/server/fanpage/routes';
import {boundedText} from '@/server/auth/apple-notifications/reauthentication-provider';
import {requireSameAppOrigin} from '@/server/config/app-origin';
import {invitationEmailSchema,invitationListSchema,invitationPreviewSchema,invitationReceiptSchema} from './domain';
import {newInvitationToken,sealInvitationToken,invitationTokenHash} from './crypto';
const headers={'cache-control':'private, no-store',vary:'Authorization, Cookie','referrer-policy':'no-referrer'};
const createSchema=z.object({email:invitationEmailSchema,requestId:z.uuid(),locale:z.string().max(20).default('ko')}).strict();
const decisionSchema=z.discriminatedUnion('action',[z.object({action:z.literal('accept'),requestId:z.uuid(),membershipConsent:z.literal(true),privacyConsent:z.literal(true),membershipVersion:z.literal('group-membership-v1'),privacyVersion:z.string().min(1).max(80),answer:z.string().max(1000).default('')}).strict(),z.object({action:z.literal('decline'),requestId:z.uuid()}).strict()]);
const token=z.string().regex(/^[a-f0-9]{64}$/);
const cookieName=(id:string)=>`kyaa_group_invite_${id}`;
function cookie(request:Request,id:string){const prefix=cookieName(id)+'=',matches=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(prefix));if(matches.length!==1)throw new Error('GROUP_INVITATION_NOT_FOUND');return token.parse(matches[0]!.slice(prefix.length));}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
export function createGroupInvitationHandler(deps:Pick<FanpageDependencies,'authorize'|'rpc'>&{origin:string;tokenKey?:string}){
 return async(operation:'create'|'list'|'handoff'|'preview'|'decide'|'revoke',request:Request,params:{pageId?:string;invitationId?:string})=>{
  try{
   const pageId=params.pageId?z.uuid().parse(params.pageId):null,id=params.invitationId?z.uuid().parse(params.invitationId):null;
   if(operation==='handoff'){
    if(!id)throw new Error('GROUP_INVITATION_INVALID');try{requireSameAppOrigin(request,deps.origin);}catch{throw new Error('GROUP_INVITATION_FORBIDDEN');}
    const body=z.object({token}).strict().parse(JSON.parse(await boundedText(request,2048)));
    const response=json({ok:true});response.headers.set('set-cookie',`${cookieName(id)}=${body.token}; Path=/api/groups/invitations/${id}; HttpOnly; SameSite=Lax; Max-Age=3600${deps.origin.startsWith('https:')?'; Secure':''}`);return response;
   }
   let actor:string|null=null;
   if(operation!=='preview'||request.headers.has('authorization'))actor=(await deps.authorize(request.headers.get('authorization'))).appUserId;
   let input:Record<string,unknown>={},rpcOperation:string=operation;
   if(operation==='create'){
    const body=createSchema.parse(JSON.parse(await boundedText(request,4096))),invitationId=crypto.randomUUID(),secret=newInvitationToken();
    if(!['https://dev.kyaa.io','https://kyaa.io'].includes(deps.origin))throw new Error('GROUP_INVITATION_UNAVAILABLE');
    input={id:invitationId,email:body.email,requestId:body.requestId,locale:body.locale==='ko'?'ko':'en',origin:deps.origin,tokenHash:invitationTokenHash(secret),tokenEncrypted:sealInvitationToken(secret,invitationId,pageId!,deps.tokenKey)};
   }else if(operation==='preview'||operation==='decide'){
    if(!id)throw new Error('GROUP_INVITATION_INVALID');input.tokenHash=invitationTokenHash(cookie(request,id));
    if(operation==='decide'){const {action,...body}=decisionSchema.parse(JSON.parse(await boundedText(request,8192)));rpcOperation=action;input={...input,...body};}
   }
   const result=await deps.rpc('group_membership_invitation_dispatch',{p_operation:rpcOperation,p_actor:actor,p_page_id:pageId,p_invitation_id:id,p_input:input});
   const schema=operation==='list'?invitationListSchema:operation==='preview'?invitationPreviewSchema:invitationReceiptSchema;
   const response=json(schema.parse(result));
   return response;
  }catch(error){
   if(error instanceof AuthError)return json({error:{code:error.code}},error.status);
   if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:{code:'GROUP_INVITATION_INVALID'}},400);
   const code=error instanceof Error?error.message:'';
   const status=({GROUP_INVITATION_INVALID:400,GROUP_INVITATION_CONSENT_REQUIRED:400,GROUP_INVITATION_FORBIDDEN:403,GROUP_INVITATION_NOT_FOUND:404,GROUP_INVITATION_CONFLICT:409,GROUP_INVITATION_RATE_LIMITED:429,GROUPS_INVALID_REQUEST:400,GROUPS_FORBIDDEN:403,GROUPS_CONFLICT:409,GROUPS_NOT_FOUND:404}as Record<string,number>)[code]??503;
   return json({error:{code:status===503?'GROUP_INVITATION_UNAVAILABLE':code}},status);
  }
 };
}

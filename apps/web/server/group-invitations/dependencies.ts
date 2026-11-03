import 'server-only';
import {createFanpageDependencies} from '@/server/fanpage/dependencies';
import {loadServerEnv} from '@/server/config/env';
import {createGroupInvitationHandler} from './routes';
export async function groupInvitationRoute(operation:Parameters<ReturnType<typeof createGroupInvitationHandler>>[0],request:Request,params:{pageId?:string;invitationId?:string}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')return Response.json({error:{code:'GROUPS_NOT_FOUND'}},{status:404,headers:{'cache-control':'private, no-store'}});
 try{const env=loadServerEnv();return await createGroupInvitationHandler({...createFanpageDependencies(),origin:new URL(env.NEXT_PUBLIC_APP_URL).origin,...(env.GROUP_INVITATION_TOKEN_KEY?{tokenKey:env.GROUP_INVITATION_TOKEN_KEY}:{})})(operation,request,params);}
 catch{return Response.json({error:{code:'GROUP_INVITATION_UNAVAILABLE'}},{status:503,headers:{'cache-control':'private, no-store'}});}
}

import {z} from 'zod';
import type {FanpageDependencies} from '@/server/fanpage/routes';
import {contentFailure} from '@/server/fan-posts/routes';
const keySchema=z.string().regex(/^raffle-results:[a-z0-9-]{1,80}:[a-f0-9T:.Z+-]{1,120}$/);
export function createPageNoticeHandler(deps:Pick<FanpageDependencies,'authorize'|'rpc'>){
 return async(request:Request)=>{
  try{
   const {appUserId}=await deps.authorize(request.headers.get('authorization'));
   const keys=new URL(request.url).searchParams.getAll('key');
   if(keys.length!==1)return Response.json({error:{code:'FAN_WEB_INVALID_INPUT'}},{status:400});
   const key=keySchema.parse(keys[0]);
   const seen=z.boolean().parse(await deps.rpc('page_notice_seen',{p_app_user_id:appUserId,p_key:key,p_mark:request.method==='POST'}));
   return Response.json({seen},{headers:{'cache-control':'private, no-store',vary:'Authorization'}});
  }catch(error){return contentFailure(error);}
 };
}

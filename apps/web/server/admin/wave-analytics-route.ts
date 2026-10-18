import 'server-only';
import {z} from 'zod';
import {AuthError} from '@/features/auth/domain/auth-errors';
import type {AdminSession} from './admin-session-gate';
const rowsSchema=z.array(z.object({
 channel:z.enum(['google','bing','naver','telegram','direct','other']),
 event:z.enum(['page_view','inquiry_open','inquiry_submit','inquiry_accepted']),
 event_count:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
 session_count:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()).max(24);
const headers={'cache-control':'private, no-store',vary:'Authorization'};
export function createGetWaveAnalyticsHandler(deps:{
 authorize(input:{authorization:string;correlationId:string}):Promise<AdminSession>;
 read(input:{appUserId:string;allowlistId:string;days:number}):Promise<unknown>;
}) {
 return async(request:Request)=>{
  try {
   const admin=await deps.authorize({authorization:request.headers.get('authorization')??'',correlationId:crypto.randomUUID()});
   const params=new URL(request.url).searchParams;
   const period=params.get('days')??'7';
   if([...params.keys()].some(key=>key!=='days'||params.getAll(key).length!==1)||!/^(7|30|90)$/.test(period))return Response.json({error:{code:'INVALID_QUERY'}},{status:400,headers});
   const days=Number(period);
   const rows=rowsSchema.parse(await deps.read({appUserId:admin.appUserId,allowlistId:admin.allowlistId,days}));
   return Response.json({days,rows},{headers});
  }catch(error){
   const status=error instanceof AuthError?error.status:503;
   return Response.json({error:{code:status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':'WAVE_ANALYTICS_UNAVAILABLE'}},{status,headers});
  }
 };
}

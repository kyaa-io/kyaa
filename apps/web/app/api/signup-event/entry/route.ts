import { createFanpageDependencies } from '@/server/fanpage/dependencies';
import { createClient } from '@/server/data/client';
import { loadServerEnv } from '@/server/config/env';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { raffleInviteCode } from '@/features/benefit/domain/signup-event';
import { localSignupEnabled, raffleChances, raffleTotalChances, readLocalSnapshot, type LocalSnapshot } from '@/server/signup-event/local';
import { createSignupRaffleDatabase, readSignupRaffleStored } from '@/server/signup-event/database';
import { refreshLocalSignupEvent } from '@/server/signup-event/refresh';
const headers={'cache-control':'private, no-store',vary:'Authorization'};
/** 전체 기회 합계용 저장 값은 1분 동안 다시 쓴다(요청마다 응모자 전원의 행을 읽지 않게). */
let storedCache:{at:number;snapshot:Promise<LocalSnapshot>}|undefined;
function storedSnapshot(){
 if(!storedCache||Date.now()-storedCache.at>60_000){const snapshot=readSignupRaffleStored(createSignupRaffleDatabase());snapshot.catch(()=>{storedCache=undefined;});storedCache={at:Date.now(),snapshot};}
 return storedCache.snapshot;
}
/** 내 응모 상태: 응모 여부, 당첨 기회 수(기본 1 + 댓글·출석 + 친구 초대), 내 링크로 가입·응모한 친구 수, 응모자 전체의 당첨 기회 합계. 전부 서버가 센 값이다.
 * 합계를 못 읽으면 totalChances만 빼고 답한다(응모 상태는 그대로). */
async function status(appUserId:string){
 const snapshot=await readLocalSnapshot(appUserId);
 const user=snapshot.users.find(user=>user.id===appUserId);
 const mine=raffleChances(snapshot).find(row=>row.userId===appUserId);
 let totalChances:number|undefined;
 if(mine){try{totalChances=raffleTotalChances(await storedSnapshot(),mine);}catch{console.warn('RAFFLE_TOTAL_UNAVAILABLE');}}
 return {entered:!!mine,passportReceived:user?.passportReceived??false,communityJoined:user?.communityJoined??false,chances:mine?.entries??0,friends:mine?.friends??0,...(totalChances?{totalChances}:{})};
}
/** 친구의 초대 코드(body.invite)는 기존 친구 초대 등록 그대로 처리한다(본인 코드·이미 등록·기존 회원 거절은 그 규칙을 따른다). 등록에 실패해도 응모는 된다. */
async function inviteFrom(request:Request){
 try{const text=(await request.text()).slice(0,1024);return text?raffleInviteCode((JSON.parse(text) as {invite?:unknown})?.invite):undefined;}catch{return undefined;}
}
export async function GET(request: Request) {
 if(!localSignupEnabled())return new Response(null,{status:404,headers});
 try {
  const actor=await createFanpageDependencies().authorize(request.headers.get('authorization'));
  return Response.json(await status(actor.appUserId),{headers});
 }catch(error){return new Response(null,{status:error instanceof AuthError?error.status:503,headers});}
}
export async function POST(request: Request) {
 if(!localSignupEnabled())return new Response(null,{status:404,headers});
 try {
  const deps=createFanpageDependencies();
  const actor=await deps.authorize(request.headers.get('authorization'));
  const invite=await inviteFrom(request);
  const env=loadServerEnv();
  const database=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!await refreshLocalSignupEvent(database,actor.appUserId,true))return new Response(null,{status:409,headers});
  // registered: 친구 초대로 등록됨 · refused: 등록할 수 없는 코드(본인·이미 등록·기존 회원 등, 다시 보내지 않는다) · pending: 잠시 뒤 다시(계정 준비 중 등)
  let inviteState:'registered'|'refused'|'pending'|undefined;
  if(invite){
   try{await deps.rpc('redeem_community_stamp_invite',{p_app_user_id:actor.appUserId,p_code:invite});inviteState='registered';}
   catch(error){
    const code=error instanceof Error?error.message:'';
    inviteState=/^COMMUNITY_STAMP_(SELF_INVITE|ALREADY_REDEEMED|INVITE_INELIGIBLE|INVALID_REQUEST|UNAVAILABLE)$/.test(code)?'refused':'pending';
    console.warn('RAFFLE_INVITE_NOT_REGISTERED',code||'unknown');
   }
  }
  return Response.json({...await status(actor.appUserId),...(inviteState?{invite:inviteState}:{})},{headers});
 }catch(error){return new Response(null,{status:error instanceof AuthError?error.status:503,headers});}
}

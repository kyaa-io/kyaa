import { createFanpageDependencies } from '@/server/fanpage/dependencies';
import { createClient } from '@/server/data/client';
import { loadServerEnv } from '@/server/config/env';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { localSignupEnabled, readLocalSnapshot } from '@/server/signup-event/local';
import { refreshLocalSignupEvent } from '@/server/signup-event/refresh';
export async function POST(request: Request) {
 const headers={'cache-control':'private, no-store',vary:'Authorization'};
 if(!localSignupEnabled())return new Response(null,{status:404,headers});
 try {
  const actor=await createFanpageDependencies().authorize(request.headers.get('authorization'));
  const env=loadServerEnv();
  const database=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!await refreshLocalSignupEvent(database,actor.appUserId,true))return new Response(null,{status:409,headers});
  const snapshot=await readLocalSnapshot(actor.appUserId);
  const user=snapshot.users.find(user=>user.id===actor.appUserId);
  return Response.json({entered:true,passportReceived:user?.passportReceived??false,communityJoined:user?.communityJoined??false},{headers});
 }catch(error){return new Response(null,{status:error instanceof AuthError?error.status:503,headers});}
}

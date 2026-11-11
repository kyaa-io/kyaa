import { createFanpageDependencies } from '@/server/fanpage/dependencies';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { localSignupEnabled } from '@/server/signup-event/local';
import { createLocalShareLink } from '@/server/signup-event/sharing';
export async function POST(request:Request) {
 const headers={'cache-control':'private, no-store',vary:'Authorization'};
 if(!localSignupEnabled())return new Response(null,{status:404,headers});
 try {
  const actor=await createFanpageDependencies().authorize(request.headers.get('authorization'));
  return Response.json({href:`/signup-event/r?token=${await createLocalShareLink(actor.appUserId)}`},{headers});
 }catch(error){return new Response(null,{status:error instanceof AuthError?error.status:503,headers});}
}

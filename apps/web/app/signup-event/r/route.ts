import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { localSignupEnabled } from '@/server/signup-event/local';
import { recordLocalShareClick } from '@/server/signup-event/sharing';
export async function GET(request:NextRequest) {
 if(!localSignupEnabled())return new Response(null,{status:404});
 try {
  const token=request.nextUrl.searchParams.get('token')??'';
  const cookie=request.cookies.get('kyaa-signup-visitor')?.value;
  const visitor=z.uuid().safeParse(cookie).success?cookie!:randomUUID();
  const link=await recordLocalShareClick(token,visitor);
  if(!link)return new Response(null,{status:404});
  const response=NextResponse.redirect(new URL('/signup-event',request.url));
  response.headers.set('cache-control','private, no-store');
  const options={httpOnly:true,sameSite:'lax' as const,secure:request.nextUrl.protocol==='https:',path:'/'};
  response.cookies.set('kyaa-signup-visitor',visitor,options);
  if(!request.cookies.has('kyaa-signup-referral'))response.cookies.set('kyaa-signup-referral',token,options);
  return response;
 }catch{return new Response(null,{status:503,headers:{'cache-control':'no-store'}});}
}

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { MobileSettingsRepository, type MobileSettingsRpcClient } from "@/server/mobile-settings/repository";
import { deliverMobilePush } from "@/server/mobile-settings/push-worker";
import { createPlatformPushProviderFromEnvironment } from "@/server/mobile-settings/push-providers";
export const dynamic="force-dynamic";export const runtime="nodejs";export const maxDuration=60;
const headers={"cache-control":"no-store"} as const;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,actual=Buffer.from(request.headers.get("authorization")??""),expected=Buffer.from(`Bearer ${secret??""}`);
 if(!secret||secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:{code:"UNAUTHORIZED"}},{status:401,headers});
 try{const configured=createPlatformPushProviderFromEnvironment();if(!configured)return Response.json({configured:false,platforms:[]},{headers});
  const env=loadServerEnv(),db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return Response.json({configured:true,platforms:configured.platforms,...await deliverMobilePush(new MobileSettingsRepository(db as unknown as MobileSettingsRpcClient),configured.provider,`mobile-push-${crypto.randomUUID()}`)},{headers});
 }catch{return Response.json({error:{code:"MOBILE_PUSH_UNAVAILABLE"}},{status:503,headers});}
}

import {createClient} from '@supabase/supabase-js';
import {createG6AnalyticsRouteDependencies} from '@/server/g6/analytics-route-dependencies';
import {loadServerEnv} from '@/server/config/env';
import {createGetWaveAnalyticsHandler} from '@/server/admin/wave-analytics-route';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const {authorize}=createG6AnalyticsRouteDependencies();
 return createGetWaveAnalyticsHandler({authorize,read:async({appUserId,allowlistId,days})=>{
  const env=loadServerEnv();
  const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
  const {data,error}=await db.rpc('wave_engagement_summary',{p_actor_app_user_id:appUserId,p_actor_admin_allowlist_id:allowlistId,p_days:days});
  if(error)throw new Error('WAVE_ANALYTICS_UNAVAILABLE');
  return data;
 }})(request);
}

import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { toContentLocale, isAppLocale } from "@/i18n/locales";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const result = z.object({ items: z.array(z.object({source:z.enum(['fan','group','notice']),id:z.string().uuid(),pageRef:z.string(),pageName:z.string(),title:z.string(),createdAt:z.string(),nickname:z.string(),noticeSlug:z.string().nullable()})).max(30),hasMore:z.boolean() });
export async function GET(request:Request) {
 const params=new URL(request.url).searchParams,queries=params.getAll('q'),locales=params.getAll('locale');
 const q=queries[0]?.trim(),locale=locales[0]??'ko';
 if(queries.length!==1||!q||q.length<2||q.length>100||locales.length>1||!isAppLocale(locale))return Response.json({error:{code:'SEARCH_INVALID_INPUT'}},{status:400});
 try {
  const deps=createFanpageDependencies(),authorization=request.headers.get('authorization');
  const actor=authorization===null?null:(await deps.authorize(authorization)).appUserId;
  const data=result.parse(await deps.rpc('search_public_posts',{p_actor:actor,p_query:q,p_locale:toContentLocale(locale)}));
  return Response.json(data,{headers:{'cache-control':'private, no-store',vary:'Authorization'}});
 }catch{return Response.json({error:{code:'SEARCH_UNAVAILABLE'}},{status:503,headers:{'cache-control':'private, no-store'}});}
}

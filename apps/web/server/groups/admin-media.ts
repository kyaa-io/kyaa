import "server-only";
import {z} from "zod";
import {AuthError} from "@/features/auth/domain/auth-errors";
import type {FanpageDependencies} from "@/server/fanpage/routes";
const uuid=z.uuid();
const headers={"cache-control":"private, no-store",vary:"Authorization"};
export function createGroupReportMediaHandler(deps:Pick<FanpageDependencies,"authorizeAdmin"|"rpc"> & {stream:(path:string,range:string|null,method:"GET"|"HEAD")=>Promise<Response>}) {
 return async(request:Request,params:{id:string;itemId:string;assetId:string})=>{
  try{
   const correlationId=crypto.randomUUID(),admin=await deps.authorizeAdmin(request.headers.get("authorization"),correlationId),variants=new URL(request.url).searchParams.getAll("variant");
   if(variants.length>1)throw new SyntaxError("duplicate variant");
   const access=z.object({storagePath:z.string(),contentType:z.string()}).strict().nullable().parse(await deps.rpc("authorize_group_report_media_read",{p_actor:admin.appUserId,p_admin_id:admin.allowlistId,p_page_id:uuid.parse(params.id),p_report_id:uuid.parse(params.itemId),p_asset_id:uuid.parse(params.assetId),p_variant:z.enum(["original","thumbnail"]).parse(variants[0]??"original"),p_request_id:correlationId}));
   if(!access)return new Response(null,{status:404,headers});
   const upstream=await deps.stream(access.storagePath,request.headers.get("range"),request.method==="HEAD"?"HEAD":"GET");
   if(!upstream.ok&&upstream.status!==206&&upstream.status!==416)throw new Error("unavailable");
   const responseHeaders=new Headers({...headers,"content-type":access.contentType,"accept-ranges":"bytes","x-content-type-options":"nosniff"});
   for(const key of ["content-length","content-range","etag","last-modified"]){const value=upstream.headers.get(key);if(value)responseHeaders.set(key,value);}
   return new Response(request.method==="HEAD"?null:upstream.body,{status:upstream.status,headers:responseHeaders});
  }catch(error){
   const status=error instanceof AuthError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:error instanceof Error&&error.message==="GROUPS_FORBIDDEN"?403:503;
   return Response.json({error:{code:status===503?"GROUPS_UNAVAILABLE":status===400?"GROUPS_INVALID_REQUEST":status===403?"GROUPS_FORBIDDEN":"AUTHENTICATION_REQUIRED"}},{status,headers});
  }
 };
}

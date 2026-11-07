import "server-only";
import { z } from "zod";
import { APP_LOCALES } from "@/i18n/locales";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { GROUP_PUBLIC_PEOPLE_MAX_OFFSET,GROUP_PUBLIC_PEOPLE_PAGE_LIMIT,groupPeopleModeSchema,groupPeopleSchema,groupPublicPeopleHeartsSchema,groupPublicPeopleSchema,groupPublicRankingSchema,groupPublicRoomsSchema } from "./domain";
const headers={"cache-control":"private, no-store",vary:"Authorization"};
export function groupPeopleFailure(error:unknown){
 if(error instanceof AuthError)return Response.json({error:{code:error.code}},{status:error.status,headers});
 if(error instanceof z.ZodError||error instanceof SyntaxError)return Response.json({error:{code:"GROUPS_INVALID_REQUEST"}},{status:400,headers});
 const marker=error instanceof Error?error.message:"",statuses:Record<string,number>={GROUPS_FORBIDDEN:403,GROUPS_NOT_FOUND:404,GROUPS_INVALID_REQUEST:400};
 return Response.json({error:{code:statuses[marker]?marker:"GROUPS_UNAVAILABLE"}},{status:statuses[marker]??503,headers});
}
export function createGroupPeopleHandler(deps:FanpageDependencies){return async(request:Request,pageId:string)=>{
 try{
  const owner=await deps.authorize(request.headers.get("authorization")),query=new URL(request.url).searchParams;
  for(const key of query.keys())if(!["mode","search","cursor","limit","locale"].includes(key)||query.getAll(key).length>1)throw new SyntaxError("Invalid query");
  const mode=groupPeopleModeSchema.parse(query.get("mode")??"members"),search=z.string().trim().max(100).parse(query.get("search")??""),cursor=query.has("cursor")?z.uuid().parse(query.get("cursor")):null,limit=z.coerce.number().int().min(1).max(100).parse(query.get("limit")??30);
  const locale=z.enum(APP_LOCALES).parse(query.get("locale")??"ko");
  const result=await deps.rpc("read_group_people",{p_actor:owner.appUserId,p_page_id:z.uuid().parse(pageId),p_mode:mode,p_search:search,p_cursor:cursor,p_limit:limit,p_locale:locale==="ko"?"ko":"en"});
  const parsed=groupPeopleSchema.safeParse(result);if(!parsed.success)throw new Error("GROUPS_UNAVAILABLE");
  return Response.json(parsed.data,{headers});
 }catch(error){return groupPeopleFailure(error);}
};}
async function optionalActor(deps:FanpageDependencies,request:Request){const auth=request.headers.get("authorization");return auth===null?null:(await deps.authorize(auth)).appUserId;}
export function createGroupPublicPeopleHandler(deps:FanpageDependencies){return async(request:Request,pageId:string)=>{
 try{
  const actor=await optionalActor(deps,request),query=new URL(request.url).searchParams;
  for(const key of query.keys())if(!["offset","limit","locale","hearts"].includes(key)||query.getAll(key).length>1)throw new SyntaxError("Invalid query");
  const hearts=query.has("hearts");if(hearts&&query.get("hearts")!=="1")throw new SyntaxError("Invalid query");
  const offset=z.coerce.number().int().min(0).max(GROUP_PUBLIC_PEOPLE_MAX_OFFSET).parse(query.get("offset")??0),limit=z.coerce.number().int().min(1).max(GROUP_PUBLIC_PEOPLE_PAGE_LIMIT).parse(query.get("limit")??GROUP_PUBLIC_PEOPLE_PAGE_LIMIT);
  const locale=z.enum(APP_LOCALES).parse(query.get("locale")??"ko");
  const result=await deps.rpc(hearts?"read_group_public_people_hearts":"read_group_public_people",{p_actor:actor,p_page_id:z.uuid().parse(pageId),p_offset:offset,p_limit:limit,p_locale:locale==="ko"?"ko":"en"});
  const parsed=(hearts?groupPublicPeopleHeartsSchema:groupPublicPeopleSchema).safeParse(result);if(!parsed.success)throw new Error("GROUPS_UNAVAILABLE");
  return Response.json(parsed.data,{headers});
 }catch(error){return groupPeopleFailure(error);}
};}
export function createGroupPublicRoomsHandler(deps:FanpageDependencies){return async(request:Request,pageId:string)=>{
 try{
  const actor=await optionalActor(deps,request);
  if(new URL(request.url).search)throw new SyntaxError("Invalid query");
  const result=await deps.rpc("read_group_public_rooms",{p_actor:actor,p_page_id:z.uuid().parse(pageId)});
  const parsed=groupPublicRoomsSchema.safeParse(result);if(!parsed.success)throw new Error("GROUPS_UNAVAILABLE");
  return Response.json(parsed.data,{headers});
 }catch(error){return groupPeopleFailure(error);}
};}
export function createGroupPublicRankingHandler(deps:FanpageDependencies){return async(request:Request,pageId:string)=>{
 try{
  const actor=await optionalActor(deps,request);
  if(new URL(request.url).search)throw new SyntaxError("Invalid query");
  const result=await deps.rpc("read_group_public_ranking",{p_actor:actor,p_page_id:z.uuid().parse(pageId)});
  const parsed=groupPublicRankingSchema.safeParse(result);if(!parsed.success)throw new Error("GROUPS_UNAVAILABLE");
  return Response.json(parsed.data,{headers});
 }catch(error){return groupPeopleFailure(error);}
};}

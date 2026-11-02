import 'server-only';
import {AuthError} from '@/features/auth/domain/auth-errors';
import type {FanpageDependencies} from '@/server/fanpage/routes';
import {groupBenefitsCatalogSchema,groupBenefitsQuerySchema} from './domain';
const headers={'cache-control':'private, no-store',vary:'Authorization'};
export const groupBenefitsUnavailable=()=>Response.json({error:{code:'GROUP_BENEFITS_UNAVAILABLE'}},{status:503,headers});
export function createGroupBenefitsHandler(deps:Pick<FanpageDependencies,'authorize'|'rpc'>){return async(request:Request)=>{
 try{
  const params=new URL(request.url).searchParams;
  if([...params.keys()].some(key=>params.getAll(key).length!==1))return Response.json({error:{code:'GROUP_BENEFITS_INVALID'}},{status:400,headers});
  const parsed=groupBenefitsQuerySchema.safeParse(Object.fromEntries(params));
  if(!parsed.success)return Response.json({error:{code:'GROUP_BENEFITS_INVALID'}},{status:400,headers});
  const auth=request.headers.get('authorization'),actor=auth===null?null:(await deps.authorize(auth)).appUserId;
  const result=groupBenefitsCatalogSchema.safeParse(await deps.rpc('read_group_benefits_catalog',{p_kind:parsed.data.kind,p_actor:actor,p_cursor:parsed.data.cursor??null,p_limit:parsed.data.limit}));
  if(!result.success||result.data.kind!==parsed.data.kind)return groupBenefitsUnavailable();
  return Response.json(result.data,{headers});
 }catch(error){
  if(error instanceof AuthError)return Response.json({error:{code:error.code}},{status:error.status,headers});
  const code=error instanceof Error?error.message:'';
  const status=({GROUP_BENEFITS_NOT_FOUND:404,GROUP_BENEFITS_INVALID:400,GROUPS_FORBIDDEN:403,FAN_WEB_ACTIVE_ACCOUNT_REQUIRED:403}as Record<string,number>)[code];
  return status?Response.json({error:{code}},{status,headers}):groupBenefitsUnavailable();
 }
};}

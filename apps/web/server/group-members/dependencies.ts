import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupPeopleHandler,groupPeopleFailure } from "./routes";
export async function groupPeopleRoute(request:Request,pageId:string){
 if(process.env.KYAA_GROUPS_ENABLED!=="true")return Response.json({error:{code:"GROUPS_NOT_FOUND"}},{status:404,headers:{"cache-control":"private, no-store"}});
 try{return await createGroupPeopleHandler(createFanpageDependencies())(request,pageId);}catch(error){return groupPeopleFailure(error);}
}

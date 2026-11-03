import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,context:{params:Promise<{id?:string;itemId?:string}>}){return groupRoute("page-resolve-report",request,await context.params);}

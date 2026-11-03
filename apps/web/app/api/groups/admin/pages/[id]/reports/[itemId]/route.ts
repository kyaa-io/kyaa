import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function PATCH(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("resolve-report",request,await context.params);}

export async function GET(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("report-evidence",request,await context.params);}

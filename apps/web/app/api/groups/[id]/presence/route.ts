import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("presence",request,await context.params);}
export async function PUT(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("heartbeat",request,await context.params);}

import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function PATCH(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("room-state",request,await context.params);}

import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function PUT(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("dislike",request,await context.params);}

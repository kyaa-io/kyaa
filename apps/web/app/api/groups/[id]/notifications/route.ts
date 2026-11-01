import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id?:string;itemId?:string}>}){return groupRoute("notifications",request,await context.params);}
export async function PUT(request:Request,context:{params:Promise<{id?:string;itemId?:string}>}){return groupRoute("set-notifications",request,await context.params);}

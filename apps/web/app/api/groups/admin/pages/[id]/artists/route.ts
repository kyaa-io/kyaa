import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function POST(request:Request, context:{params:Promise<{id?:string;itemId?:string}>}) {return groupRoute("artist-bind",request,await context.params);}

export async function GET(request:Request, context:{params:Promise<{id?:string}>}) {return groupRoute("artist-bindings",request,await context.params);}
export async function DELETE(request:Request, context:{params:Promise<{id?:string}>}) {return groupRoute("artist-unbind",request,await context.params);}

import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request) {return groupRoute("presence-setting",request);}
export async function PUT(request:Request) {return groupRoute("set-presence-setting",request);}

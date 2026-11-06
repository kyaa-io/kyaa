import { groupPublicRoomsRoute } from "@/server/group-members/dependencies";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return groupPublicRoomsRoute(request,(await context.params).id);}

import { groupPeopleRoute } from "@/server/group-members/dependencies";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return groupPeopleRoute(request,(await context.params).id);}

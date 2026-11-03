import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("review", request, await context.params); }

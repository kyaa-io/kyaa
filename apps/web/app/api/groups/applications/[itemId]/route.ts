import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) { return groupRoute("revise", request, await context.params); }

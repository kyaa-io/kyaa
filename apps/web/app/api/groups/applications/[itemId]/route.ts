import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) { return groupRoute("application-status", request, await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) { return groupRoute("revise", request, await context.params); }

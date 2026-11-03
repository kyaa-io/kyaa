import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("members", request, await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("role", request, await context.params); }

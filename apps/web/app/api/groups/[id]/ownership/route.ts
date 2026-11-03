import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id?: string; itemId?: string }> }) { return groupRoute("transfer", request, await context.params); }

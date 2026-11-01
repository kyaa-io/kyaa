import { groupRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) { return groupRoute("resolve", request, await context.params); }

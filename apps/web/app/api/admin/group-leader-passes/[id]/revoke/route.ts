import { leaderPassRoute } from "@/server/groups/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return leaderPassRoute("revoke", request, await context.params); }

import { groupEarningsRoute } from "@/server/group-earnings/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return groupEarningsRoute(request, await context.params); }

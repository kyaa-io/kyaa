import { groupOperatorStatsRoute } from "@/server/group-operator-stats/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return groupOperatorStatsRoute(request, await context.params); }

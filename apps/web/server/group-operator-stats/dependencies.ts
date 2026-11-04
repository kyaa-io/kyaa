import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupOperatorStatsHandler, groupOperatorStatsFailure } from "./routes";
export async function groupOperatorStatsRoute(request: Request, params: { id: string }) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUP_STATS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
  try { return await createGroupOperatorStatsHandler(createFanpageDependencies())(request, params); }
  catch (error) { return groupOperatorStatsFailure(error); }
}

import { createRankingsRouteHandlers } from "@/server/rankings/dependencies";
import { rankingFailure } from "@/server/rankings/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createRankingsRouteHandlers().challenges(request); } catch (error) { return rankingFailure(error); } }

import { createRankingsRouteHandlers } from "@/server/rankings/dependencies";
import { rankingFailure } from "@/server/rankings/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await createRankingsRouteHandlers().page(request, (await params).id); } catch (error) { return rankingFailure(error); }
}

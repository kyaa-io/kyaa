import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createShortformParticipationHandlers } from "@/server/shortform/participation-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ videoId: string }> }) {
  try { return await createShortformParticipationHandlers(createFanpageDependencies()).reaction(request, (await context.params).videoId); }
  catch (error) { return contentFailure(error); }
}
export const GET = handle;
export const PUT = handle;

import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createShortformParticipationHandlers } from "@/server/shortform/participation-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createShortformParticipationHandlers(createFanpageDependencies()).removeComment(request, (await context.params).id); }
  catch (error) { return contentFailure(error); }
}
export const DELETE = handle;

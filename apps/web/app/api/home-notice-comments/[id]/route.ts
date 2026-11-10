import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createHomeNoticeParticipationHandlers } from "@/server/home-notice/home-notice-participation-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    return await createHomeNoticeParticipationHandlers(createFanpageDependencies()).removeComment(request, params.id);
  } catch (error) { return contentFailure(error); }
}
export const DELETE = handle;

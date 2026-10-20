import { withWaveAccess } from "@/server/wave/access";
import { createContentDependencies } from "@/server/fan-posts/dependencies";
import { contentFailure, createContentHandlers } from "@/server/fan-posts/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    return await createContentHandlers(createContentDependencies()).removeComment(request, params.id);
  } catch (error) { return contentFailure(error); }
}
const waveOriginalDELETE = handle;

export const DELETE = withWaveAccess(waveOriginalDELETE);

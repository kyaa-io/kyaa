import { withWaveAccess } from "@/server/wave/access";
import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalPUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileContentRouteHandlers().commentReaction(request, "fan_clip_comment", (await context.params).id); }
  catch { return mobileContentUnavailable(); }
}

export const PUT = withWaveAccess(waveOriginalPUT);

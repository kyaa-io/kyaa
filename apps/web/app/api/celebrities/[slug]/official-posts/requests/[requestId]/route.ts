import { withWaveAccess } from "@/server/wave/access";
import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string; requestId: string }> }) {
  try { const { slug, requestId } = await context.params; return await createMobileContentRouteHandlers().officialPostStatus(request, slug, requestId); }
  catch { return mobileContentUnavailable(); }
}

export const GET = withWaveAccess(waveOriginalGET);

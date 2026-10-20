import { withWaveAccess } from "@/server/wave/access";
import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function waveOriginalPOST(request: Request, context: { params: Promise<{ slug: string; noticeSlug: string }> }) {
  try {
    const { slug, noticeSlug } = await context.params;
    return await createMobileContentRouteHandlers().readOfficialPost(request, slug, noticeSlug);
  } catch { return mobileContentUnavailable(); }
}

export const POST = withWaveAccess(waveOriginalPOST);

import { withWaveAccess } from "@/server/wave/access";
import { createMobileContentRouteHandlers, mobileContentUnavailable } from "@/server/mobile-content/dependencies";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try { return await createMobileContentRouteHandlers().latestOfficialPost(request, (await context.params).slug); }
  catch { return mobileContentUnavailable(); }
}

export const GET = withWaveAccess(waveOriginalGET);

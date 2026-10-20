import { withWaveAccess } from "@/server/wave/access";
import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function waveOriginalGET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileMediaRouteHandlers().read(request, (await context.params).id, true); }
  catch { return mediaUnavailable(); }
}
async function waveOriginalHEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return waveOriginalGET(request, context);
}

export const GET = withWaveAccess(waveOriginalGET);
export const HEAD = withWaveAccess(waveOriginalHEAD);

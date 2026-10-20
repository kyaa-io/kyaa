import { withWaveAccess } from "@/server/wave/access";
import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileMediaRouteHandlers().read(request, (await context.params).id); } catch { return mediaUnavailable(); } }

export const GET = withWaveAccess(waveOriginalGET);

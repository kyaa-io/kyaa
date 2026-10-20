import { withWaveAccess } from "@/server/wave/access";
import { participationRoute } from "@/server/schedules/routes";
async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }) { return participationRoute("live-submissions", request, await context.params); }
async function waveOriginalPOST(request: Request, context: { params: Promise<{ slug: string }> }) { return participationRoute("live-submissions", request, await context.params); }

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);

import { withWaveAccess } from "@/server/wave/access";
import { participationRoute } from "@/server/schedules/routes";
async function waveOriginalDELETE(request: Request, context: { params: Promise<{ id: string }> }) { return participationRoute("live-submission", request, await context.params); }

export const DELETE = withWaveAccess(waveOriginalDELETE);

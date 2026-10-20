import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createWaveMissionHandlers } from "@/server/fanpage/wave-mission-routes";
import { contentFailure } from "@/server/fan-posts/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    return await createWaveMissionHandlers(createFanpageDependencies()).progress(request, (await context.params).slug);
  } catch (error) { return contentFailure(error); }
}

export const GET = withWaveAccess(waveOriginalGET);

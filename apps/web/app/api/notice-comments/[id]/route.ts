import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalDELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return await createFanpageHandlers(createFanpageDependencies()).removeComment(request, id);
  } catch (error) { return fanpageFailure(error); }
}

export const DELETE = withWaveAccess(waveOriginalDELETE);

import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createProgramHandlers } from "@/server/fanpage/program-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    return await createProgramHandlers(createFanpageDependencies()).stamps(request, (await context.params).slug);
  } catch (error) { return contentFailure(error); }
}

export const GET = withWaveAccess(waveOriginalGET);

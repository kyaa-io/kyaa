import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { contentFailure } from "@/server/fan-posts/routes";
import { createProgramHandlers } from "@/server/fanpage/program-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ slug: string; program: string }> }) {
  try {
    const { slug, program } = await context.params;
    return await createProgramHandlers(createFanpageDependencies()).posts(request, slug, program);
  } catch (error) { return contentFailure(error); }
}
const waveOriginalGET = handle;
const waveOriginalPOST = handle;

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);

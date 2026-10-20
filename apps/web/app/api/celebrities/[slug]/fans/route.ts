import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanCommunityHandlers } from "@/server/fanpage/community-routes";
import { fanpageFailure } from "@/server/fanpage/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    return await createFanCommunityHandlers(createFanpageDependencies()).fans(request, slug);
  } catch (error) {
    return fanpageFailure(error);
  }
}

export const GET = withWaveAccess(waveOriginalGET);

import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanCommunityHandlers } from "@/server/fanpage/community-routes";
import { fanpageFailure } from "@/server/fanpage/routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalGET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return await createFanCommunityHandlers(createFanpageDependencies()).cheerReplies(request, id);
  } catch (error) {
    return fanpageFailure(error);
  }
}

export const GET = withWaveAccess(waveOriginalGET);

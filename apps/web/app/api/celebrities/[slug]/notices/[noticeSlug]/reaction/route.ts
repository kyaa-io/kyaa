import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";

type Context = { params: Promise<{ slug: string; noticeSlug: string }> };

async function reaction(request: Request, context: Context) {
  try {
    const { slug, noticeSlug } = await context.params;
    return await createFanpageHandlers(createFanpageDependencies()).noticeReaction(request, slug, noticeSlug);
  } catch (error) {
    return fanpageFailure(error);
  }
}

export const PUT = withWaveAccess(reaction);
export const GET = withWaveAccess(reaction);

import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";

type Context = { params: Promise<{ slug: string; noticeSlug: string }> };

async function waveOriginalPUT(request: Request, context: Context) {
  try {
    const { slug, noticeSlug } = await context.params;
    return await createFanpageHandlers(createFanpageDependencies()).likeNotice(request, slug, noticeSlug);
  } catch (error) {
    return fanpageFailure(error);
  }
}

export const PUT = withWaveAccess(waveOriginalPUT);

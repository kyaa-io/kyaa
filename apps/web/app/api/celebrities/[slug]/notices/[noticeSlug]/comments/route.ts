import { withWaveAccess } from "@/server/wave/access";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createFanpageHandlers, fanpageFailure } from "@/server/fanpage/routes";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function waveOriginalGET(request: Request, context: { params: Promise<{ slug: string; noticeSlug: string }> }) {
  try {
    const { slug, noticeSlug } = await context.params;
    return await createFanpageHandlers(createFanpageDependencies()).comments(request, slug, noticeSlug);
  } catch (error) { return fanpageFailure(error); }
}

async function waveOriginalPOST(request: Request, context: { params: Promise<{ slug: string; noticeSlug: string }> }) {
  try {
    const { slug, noticeSlug } = await context.params;
    return await createFanpageHandlers(createFanpageDependencies()).postComment(request, slug, noticeSlug);
  } catch (error) { return fanpageFailure(error); }
}

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);

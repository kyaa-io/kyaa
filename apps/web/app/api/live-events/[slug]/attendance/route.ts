import { withWaveAccess } from "@/server/wave/access";
import {
  createLiveAttendanceRouteDependencies,
  liveAttendanceUnavailableResponse,
} from "../../../../../server/g3/live-attendance-route-dependencies";
import { createPostLiveAttendanceHandler } from "../../../../../server/g3/live-attendance-route";

export const dynamic = "force-dynamic";

async function waveOriginalPOST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const dependencies = createLiveAttendanceRouteDependencies();
    const { slug } = await context.params;
    return createPostLiveAttendanceHandler(dependencies)(request, { slug });
  } catch {
    return liveAttendanceUnavailableResponse();
  }
}

export const POST = withWaveAccess(waveOriginalPOST);

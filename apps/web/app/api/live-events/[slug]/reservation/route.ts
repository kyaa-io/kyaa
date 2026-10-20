import { withWaveAccess } from "@/server/wave/access";
import {
  createLiveReservationRouteDependencies,
  liveReservationUnavailableResponse,
} from "../../../../../server/g3/live-reservation-route-dependencies";
import { createPostLiveReservationHandler } from "../../../../../server/g3/live-reservation-route";

export const dynamic = "force-dynamic";

async function waveOriginalPOST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const dependencies = createLiveReservationRouteDependencies();
    const { slug: liveEventId } = await context.params;
    return createPostLiveReservationHandler(dependencies)(request, { liveEventId });
  } catch {
    return liveReservationUnavailableResponse();
  }
}

export const POST = withWaveAccess(waveOriginalPOST);

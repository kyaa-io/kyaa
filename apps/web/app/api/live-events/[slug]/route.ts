import { withWaveAccess } from "@/server/wave/access";
import {
  createLiveEventRouteDependencies,
  liveEventUnavailableResponse,
} from "../../../../server/g3/live-event-route-dependencies";
import { createGetLiveEventHandler } from "../../../../server/g3/live-event-route";

export const dynamic = "force-dynamic";

async function waveOriginalGET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const dependencies = createLiveEventRouteDependencies();
    const { slug } = await context.params;
    return createGetLiveEventHandler(dependencies)(request, { slug });
  } catch {
    return liveEventUnavailableResponse();
  }
}

export const GET = withWaveAccess(waveOriginalGET);

import { withWaveAccess } from "@/server/wave/access";
import {
  createGetJourneyHandler,
  createJourneyRouteDependencies,
  createPostJourneyHandler,
  journeyUnavailableResponse,
} from "../../../../../server/journey/journey-route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

async function waveOriginalGET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const dependencies = createJourneyRouteDependencies();
    const { slug } = await context.params;
    return createGetJourneyHandler(dependencies)(request, { slug });
  } catch {
    return journeyUnavailableResponse();
  }
}

async function waveOriginalPOST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const dependencies = createJourneyRouteDependencies();
    const { slug } = await context.params;
    return createPostJourneyHandler(dependencies)(request, { slug });
  } catch {
    return journeyUnavailableResponse();
  }
}

export const GET = withWaveAccess(waveOriginalGET);
export const POST = withWaveAccess(waveOriginalPOST);

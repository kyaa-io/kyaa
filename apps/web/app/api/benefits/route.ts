import { withWaveAccess } from "@/server/wave/access";
import { createBenefitRouteDependencies, benefitsUnavailableResponse } from "../../../server/g4/benefit-route-dependencies";
import { createGetBenefitsHandler } from "../../../server/g4/benefit-route";

export const dynamic = "force-dynamic";

async function waveOriginalGET(request: Request): Promise<Response> {
  try { return createGetBenefitsHandler(createBenefitRouteDependencies())(request); }
  catch { return benefitsUnavailableResponse(); }
}

export const GET = withWaveAccess(waveOriginalGET);

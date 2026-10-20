import { withWaveAccess } from "@/server/wave/access";
import { createBenefitRouteDependencies, benefitsUnavailableResponse } from "../../../../server/g4/benefit-route-dependencies";
import { createGetBenefitHandler } from "../../../../server/g4/benefit-route";

export const dynamic = "force-dynamic";

async function waveOriginalGET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const { id } = await context.params; return createGetBenefitHandler(createBenefitRouteDependencies())(request, { benefitId: id }); }
  catch { return benefitsUnavailableResponse(); }
}

export const GET = withWaveAccess(waveOriginalGET);

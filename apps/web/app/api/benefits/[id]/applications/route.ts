import { withWaveAccess } from "@/server/wave/access";
import {
  createBenefitRouteDependencies,
  benefitsUnavailableResponse,
} from "../../../../../server/g4/benefit-route-dependencies";
import {
  createGetOwnedBenefitApplicationHandler,
  createPostBenefitApplicationHandler,
} from "../../../../../server/g4/benefit-route";

export const dynamic = "force-dynamic";
async function waveOriginalPOST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return createPostBenefitApplicationHandler(
      createBenefitRouteDependencies(),
    )(request, { benefitId: id });
  } catch {
    return benefitsUnavailableResponse();
  }
}
async function waveOriginalGET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return createGetOwnedBenefitApplicationHandler(
      createBenefitRouteDependencies(),
    )(request, { benefitId: id });
  } catch {
    return benefitsUnavailableResponse();
  }
}

export const POST = withWaveAccess(waveOriginalPOST);
export const GET = withWaveAccess(waveOriginalGET);

import { withWaveAccess } from "@/server/wave/access";
import { createGetOwnedRaffleResultHandler, raffleResultUnavailable } from "@/server/raffle/raffle-result-route";
import { createRaffleResultRouteDependencies } from "@/server/raffle/raffle-result-route-dependencies";
export const dynamic = "force-dynamic";
async function waveOriginalGET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return createGetOwnedRaffleResultHandler(createRaffleResultRouteDependencies())(request, { benefitId: id });
  } catch { return raffleResultUnavailable(); }
}

export const GET = withWaveAccess(waveOriginalGET);

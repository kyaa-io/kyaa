import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createClaimHandler } from "@/server/dukjil/claim";
import { dukjilFailure } from "@/server/dukjil/routes";
import { rewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
export const dynamic = "force-dynamic";
/** shown / granted for a passport page heart's ad session; the server clock decides whether the reward counts. */
export async function POST(request: Request) {
  try {
    const { rpc, authorize } = createFanpageDependencies();
    return await createClaimHandler({ rpc, authorize, rewardedExchange: rewardedExchangeDecision(process.env) }).adSessionReport(request);
  } catch (error) { return dukjilFailure(error); }
}

import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createClaimHandler } from "@/server/dukjil/claim";
import { dukjilFailure } from "@/server/dukjil/routes";
import { rewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
export const dynamic = "force-dynamic";
/** Issues the rewarded-ad session a passport page heart needs (refused before the ad when the page cannot be claimed). */
export async function POST(request: Request, context: { params: Promise<{ id: string; pageNo: string }> }) {
  try {
    const { rpc, authorize } = createFanpageDependencies();
    const { id, pageNo } = await context.params;
    return await createClaimHandler({ rpc, authorize, rewardedExchange: rewardedExchangeDecision(process.env) }).adSession(request, id, pageNo);
  } catch (error) { return dukjilFailure(error); }
}

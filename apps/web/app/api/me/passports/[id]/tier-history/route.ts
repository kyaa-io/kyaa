import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
import { createTierHistoryHandlers } from "@/server/tier-history/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { rpc, authorize } = createFanpageDependencies(); return await createTierHistoryHandlers({ rpc, authorize }).history(request, (await context.params).id); } catch (error) { return dukjilFailure(error); }
}

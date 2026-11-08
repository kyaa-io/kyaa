import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { dukjilFailure } from "@/server/dukjil/routes";
import { createTierHistoryHandlers } from "@/server/tier-history/routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { const { rpc, authorize } = createFanpageDependencies(); return await createTierHistoryHandlers({ rpc, authorize }).changes(request); } catch (error) { return dukjilFailure(error); } }

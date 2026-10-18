import { createFanEconomyRouteHandlers, fanEconomyUnavailableResponse } from "@/server/mobile-fan-economy/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createFanEconomyRouteHandlers().voteIntent(request); } catch { return fanEconomyUnavailableResponse(); } }

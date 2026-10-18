import { createFanEconomyRouteHandlers, fanEconomyUnavailableResponse } from "@/server/mobile-fan-economy/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) { try { return await createFanEconomyRouteHandlers().voteIntentStatus(request, (await context.params).requestKey); } catch { return fanEconomyUnavailableResponse(); } }

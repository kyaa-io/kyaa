import { createFanEconomyRouteHandlers, fanEconomyUnavailableResponse } from "@/server/mobile-fan-economy/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) { try { return await createFanEconomyRouteHandlers().vote(request, (await context.params).projectId); } catch { return fanEconomyUnavailableResponse(); } }

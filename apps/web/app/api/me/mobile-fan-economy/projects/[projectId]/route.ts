import { createFanEconomyRouteHandlers, fanEconomyUnavailableResponse } from "@/server/mobile-fan-economy/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) { try { return await createFanEconomyRouteHandlers().project(request, (await context.params).projectId); } catch { return fanEconomyUnavailableResponse(); } }

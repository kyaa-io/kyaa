import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileBenefitsRouteHandlers().freeTicketMissions(request); } catch { return mobileBenefitsUnavailable(); } }

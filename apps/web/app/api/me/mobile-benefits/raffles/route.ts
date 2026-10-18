import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileBenefitsRouteHandlers().raffleHistory(request); } catch { return mobileBenefitsUnavailable(); } }

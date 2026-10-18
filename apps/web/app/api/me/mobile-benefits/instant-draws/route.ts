import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createMobileBenefitsRouteHandlers().draw(request); } catch { return mobileBenefitsUnavailable(); } }

import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ awardId: string }> }) { try { return await createMobileBenefitsRouteHandlers().good(request, (await context.params).awardId); } catch { return mobileBenefitsUnavailable(); } }

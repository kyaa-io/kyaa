import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ requestKey: string }> }) { try { return await createMobileBenefitsRouteHandlers().entryStatus(request, (await context.params).requestKey); } catch { return mobileBenefitsUnavailable(); } }

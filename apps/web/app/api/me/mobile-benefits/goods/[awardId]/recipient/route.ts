import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ awardId: string }> }) { try { return await createMobileBenefitsRouteHandlers().recipient(request, (await context.params).awardId); } catch { return mobileBenefitsUnavailable(); } }
export async function PUT(request: Request, context: { params: Promise<{ awardId: string }> }) { try { return await createMobileBenefitsRouteHandlers().recipient(request, (await context.params).awardId); } catch { return mobileBenefitsUnavailable(); } }

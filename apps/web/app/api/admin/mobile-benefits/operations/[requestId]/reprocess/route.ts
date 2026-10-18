import { createMobileBenefitAdminRouteHandlers, mobileBenefitAdminUnavailable } from "@/server/mobile-benefits/admin-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) { try { return await createMobileBenefitAdminRouteHandlers().reprocess(request, (await context.params).requestId); } catch { return mobileBenefitAdminUnavailable(); } }

import { createMobileBenefitAdminRouteHandlers, mobileBenefitAdminUnavailable } from "@/server/mobile-benefits/admin-dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ policyId: string }> }) { try { return await createMobileBenefitAdminRouteHandlers().togglePolicy(request, (await context.params).policyId); } catch { return mobileBenefitAdminUnavailable(); } }

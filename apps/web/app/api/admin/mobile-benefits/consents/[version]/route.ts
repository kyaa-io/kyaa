import { createMobileBenefitAdminRouteHandlers, mobileBenefitAdminUnavailable } from "@/server/mobile-benefits/admin-dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ version: string }> }) { try { return await createMobileBenefitAdminRouteHandlers().toggleConsent(request, decodeURIComponent((await context.params).version)); } catch { return mobileBenefitAdminUnavailable(); } }

import { createMobileBenefitAdminRouteHandlers, mobileBenefitAdminUnavailable } from "@/server/mobile-benefits/admin-dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileBenefitAdminRouteHandlers().operations(request); } catch { return mobileBenefitAdminUnavailable(); } }

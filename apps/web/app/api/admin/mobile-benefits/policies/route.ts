import { createMobileBenefitAdminRouteHandlers, mobileBenefitAdminUnavailable } from "@/server/mobile-benefits/admin-dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileBenefitAdminRouteHandlers().policies(request); } catch { return mobileBenefitAdminUnavailable(); } }
export async function POST(request: Request) { try { return await createMobileBenefitAdminRouteHandlers().createPolicy(request); } catch { return mobileBenefitAdminUnavailable(); } }

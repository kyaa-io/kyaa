import { createMobileStoreAdminRouteHandlers, mobileStoreAdminUnavailable } from "@/server/mobile-store/admin-dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createMobileStoreAdminRouteHandlers().recordSupportSettlement(request); } catch { return mobileStoreAdminUnavailable(); } }

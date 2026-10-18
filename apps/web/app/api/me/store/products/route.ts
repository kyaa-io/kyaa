import { createMobileStoreRouteHandlers, mobileStoreUnavailableResponse } from "@/server/mobile-store/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> { try { return await createMobileStoreRouteHandlers().products(request); } catch { return mobileStoreUnavailableResponse(); } }

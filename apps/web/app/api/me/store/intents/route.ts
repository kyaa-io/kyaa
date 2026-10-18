import { createMobileStoreRouteHandlers, mobileStoreUnavailableResponse } from "@/server/mobile-store/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> { try { return await createMobileStoreRouteHandlers().intents(request); } catch { return mobileStoreUnavailableResponse(); } }

import { createMobileProfileRouteHandlers, mobileProfileUnavailable } from "@/server/mobile-profile/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileProfileRouteHandlers().summary(request); } catch { return mobileProfileUnavailable(); } }

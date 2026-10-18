import { createMobileProfileRouteHandlers, mobileProfileUnavailable } from "@/server/mobile-profile/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileProfileRouteHandlers().passport(request, (await context.params).id); } catch { return mobileProfileUnavailable(); } }

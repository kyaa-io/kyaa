import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createMobileParticipationRouteHandlers().events(request); } catch { return mobileParticipationUnavailable(); } }

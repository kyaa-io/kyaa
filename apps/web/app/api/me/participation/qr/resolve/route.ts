import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createMobileParticipationRouteHandlers().resolveQr(request); } catch { return mobileParticipationUnavailable(); } }

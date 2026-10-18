import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) { try { return await createMobileParticipationRouteHandlers().liveContext(request, (await context.params).slug); } catch { return mobileParticipationUnavailable(); } }

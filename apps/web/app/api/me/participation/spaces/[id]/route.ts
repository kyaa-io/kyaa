import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileParticipationRouteHandlers().space(request, (await context.params).id); } catch { return mobileParticipationUnavailable(); } }

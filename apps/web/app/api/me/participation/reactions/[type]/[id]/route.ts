import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ type: string; id: string }> }) { try { const p = await context.params; return await createMobileParticipationRouteHandlers().reaction(request, p.type, p.id); } catch { return mobileParticipationUnavailable(); } }

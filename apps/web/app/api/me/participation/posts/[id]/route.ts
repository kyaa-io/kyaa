import { createMobileParticipationRouteHandlers, mobileParticipationUnavailable } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileParticipationRouteHandlers().savePost(request, (await context.params).id); } catch { return mobileParticipationUnavailable(); } }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileParticipationRouteHandlers().removePost(request, (await context.params).id); } catch { return mobileParticipationUnavailable(); } }

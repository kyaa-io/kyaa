import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{ profileId: string }> }) { try { return await createSocialRouteHandlers().unblock(request, (await context.params).profileId); } catch { return socialUnavailable(); } }

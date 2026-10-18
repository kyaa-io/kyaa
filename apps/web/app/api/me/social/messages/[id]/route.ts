import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createSocialRouteHandlers().removeMessage(request, (await context.params).id); } catch { return socialUnavailable(); } }

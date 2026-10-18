import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ profileId: string }> }) { try { return await createSocialRouteHandlers().profile(request, (await context.params).profileId); } catch { return socialUnavailable(); } }

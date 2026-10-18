import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) { try { return await createSocialRouteHandlers().linkedProfile(request, (await context.params).token); } catch { return socialUnavailable(); } }

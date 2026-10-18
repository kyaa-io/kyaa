import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createSocialRouteHandlers().profileLink(request); } catch { return socialUnavailable(); } }

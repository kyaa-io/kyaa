import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createSocialRouteHandlers().listConversations(request); } catch { return socialUnavailable(); } }
export async function POST(request: Request) { try { return await createSocialRouteHandlers().requestDm(request); } catch { return socialUnavailable(); } }

import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createSocialRouteHandlers().issueReturnRef(request); } catch { return socialUnavailable(); } }

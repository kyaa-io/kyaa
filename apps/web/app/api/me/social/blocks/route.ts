import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createSocialRouteHandlers().listBlocks(request); } catch { return socialUnavailable(); } }
export async function POST(request: Request) { try { return await createSocialRouteHandlers().block(request); } catch { return socialUnavailable(); } }

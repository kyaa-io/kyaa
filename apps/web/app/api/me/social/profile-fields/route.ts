import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return await createSocialRouteHandlers().readPublicFields(request); } catch { return socialUnavailable(); } }
export async function PUT(request: Request) { try { return await createSocialRouteHandlers().setPublicFields(request); } catch { return socialUnavailable(); } }

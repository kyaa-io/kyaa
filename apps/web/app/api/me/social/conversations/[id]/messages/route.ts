import { createSocialRouteHandlers, socialUnavailable } from "@/server/social/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createSocialRouteHandlers().messages(request, (await context.params).id); } catch { return socialUnavailable(); } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createSocialRouteHandlers().sendMessage(request, (await context.params).id); } catch { return socialUnavailable(); } }

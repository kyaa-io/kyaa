import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileMediaRouteHandlers().complete(request, (await context.params).id); } catch { return mediaUnavailable(); } }

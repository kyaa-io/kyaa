import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileMediaRouteHandlers().read(request, (await context.params).id); } catch { return mediaUnavailable(); } }

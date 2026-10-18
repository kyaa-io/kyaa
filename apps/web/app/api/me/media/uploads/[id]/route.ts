import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileMediaRouteHandlers().status(request, (await context.params).id); } catch { return mediaUnavailable(); } }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createMobileMediaRouteHandlers().cancel(request, (await context.params).id); } catch { return mediaUnavailable(); } }

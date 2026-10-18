import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return await createMobileMediaRouteHandlers().read(request, (await context.params).id, true); }
  catch { return mediaUnavailable(); }
}
export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return GET(request, context);
}

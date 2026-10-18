import { createMobileMediaRouteHandlers, mediaUnavailable } from "@/server/mobile-media/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { try { return await createMobileMediaRouteHandlers().reserve(request); } catch { return mediaUnavailable(); } }

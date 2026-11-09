import { createInstaRepostRouteHandlers } from "@/server/insta-repost/dependencies";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ error: { code: "INSTA_REPOST_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { return await createInstaRepostRouteHandlers().adminCapture(request, (await context.params).id); } catch { return unavailable(); } }

import { createInstaRepostRouteHandlers } from "@/server/insta-repost/dependencies";
export const dynamic = "force-dynamic";
const unavailable = () => Response.json({ error: { code: "INSTA_REPOST_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request) { try { return await createInstaRepostRouteHandlers().adminQueue(request); } catch { return unavailable(); } }

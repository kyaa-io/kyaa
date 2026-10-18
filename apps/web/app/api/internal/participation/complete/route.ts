import { timingSafeEqual } from "node:crypto";
import { runMobileParticipationCompletion } from "@/server/mobile-participation/dependencies";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "cache-control": "no-store" } as const;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  try { return Response.json(await runMobileParticipationCompletion(), { headers }); } catch { return Response.json({ error: { code: "PARTICIPATION_COMPLETION_UNAVAILABLE" } }, { status: 503, headers }); }
}

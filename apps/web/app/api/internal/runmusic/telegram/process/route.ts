import { timingSafeEqual } from "node:crypto";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { processRunmusicTelegram } from "@/server/runmusic/telegram";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "cache-control": "no-store" };
  if (!secret || secret.length < 32 || authorization.length !== expected.length || !timingSafeEqual(authorization, expected))
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  try {
    const deps = createFanpageDependencies(), started = Date.now();
    let handled = 0;
    while (handled < 3 && Date.now() - started < 30_000) {
      if (await processRunmusicTelegram(deps.rpc) !== "handled") break;
      handled++;
    }
    return Response.json({ handled }, { headers });
  } catch { return Response.json({ error: { code: "RUNMUSIC_TELEGRAM_UNAVAILABLE" } }, { status: 503, headers }); }
}

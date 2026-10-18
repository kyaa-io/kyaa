import { timingSafeEqual } from "node:crypto";
import { createMobileMediaMaintenance } from "@/server/mobile-media/dependencies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "cache-control": "no-store" } as const;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  }
  try {
    return Response.json(await createMobileMediaMaintenance().process(1), { headers });
  } catch {
    return Response.json({ error: { code: "MEDIA_MAINTENANCE_UNAVAILABLE" } }, { status: 503, headers });
  }
}

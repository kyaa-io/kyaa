import { cronOwnerResponse } from "@/server/cron/owner";
import { timingSafeEqual } from "node:crypto";
import { refreshDashboardSnapshot } from "@/server/onchain/dashboard-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "cache-control": "no-store" } as const;

export async function GET(request: Request) {
  const ownership = cronOwnerResponse(request);
  if (ownership) return ownership;
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  }
  try { return Response.json(await refreshDashboardSnapshot(), { headers }); }
  catch { return Response.json({ error: { code: "ONCHAIN_DASHBOARD_UNAVAILABLE" } }, { status: 503, headers }); }
}

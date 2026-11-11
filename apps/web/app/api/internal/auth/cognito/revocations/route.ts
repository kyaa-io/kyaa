import { timingSafeEqual } from "node:crypto";
import { cognitoCleanupConfig } from "@/server/auth/cognito/config";
import { authHeaders, retryRemoteRevocations } from "@/server/auth/cognito/browser-session";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers: authHeaders() });
  try { return Response.json(await retryRemoteRevocations(cognitoCleanupConfig()), { headers: authHeaders() }); }
  catch { return Response.json({ error: { code: "REVOCATION_RETRY_UNAVAILABLE" } }, { status: 503, headers: authHeaders() }); }
}

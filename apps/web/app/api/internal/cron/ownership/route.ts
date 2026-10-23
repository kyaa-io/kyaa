import { timingSafeEqual } from "node:crypto";
import { cronOwner } from "@/server/cron/owner";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const revision = process.env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) return Response.json({ error: { code: "REVISION_UNAVAILABLE" } }, { status: 503 });
  const mode = process.env.WEBHOOK_INGRESS_HOLD === "true" ? "hold" : process.env.WEBHOOK_BUFFER_ENABLED === "true" ? "buffer" : "direct";
  return Response.json({ owner: cronOwner(), provider: process.env.HOSTING_PROVIDER === "aws" ? "aws" : "vercel", revision, manifestVersion: 1, webhookIntake: { mode, accepting: mode !== "hold" } }, { headers: { "cache-control": "private, no-store" } });
}

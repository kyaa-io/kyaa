import { timingSafeEqual } from "node:crypto";
export function cronOwner(source = process.env): "vercel" | "aws" | "disabled" {
  const owner = source.CRON_OWNER ?? "vercel";
  if (owner !== "vercel" && owner !== "aws" && owner !== "disabled") throw new Error("Invalid cron owner");
  return owner;
}
export function cronOwnerResponse(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const owner = cronOwner();
  const scheduler = request.headers.get("x-byus-scheduler") === "aws" ? "aws" : "vercel";
  return owner !== scheduler ? new Response(null, { status: 204, headers: { "cache-control": "no-store" } }) : null;
}

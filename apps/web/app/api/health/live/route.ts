import { releaseSha } from "@/server/config/release-sha";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const revision = releaseSha();
  return Response.json({ status: "ok", ...(revision ? { revision } : {}) }, { headers: { "cache-control": "no-store" } });
}

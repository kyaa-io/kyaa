import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { celebritySuggestUnavailable, createCelebritySuggestHandler } from "@/server/celebrities/suggest";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  try { return await createCelebritySuggestHandler(createFanpageDependencies())(request); } catch { return celebritySuggestUnavailable(); }
}

import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupHandler, groupsUnavailable, type GroupOperation } from "./routes";
export async function groupRoute(operation: GroupOperation, request: Request, params: { id?: string; itemId?: string; slug?: string } = {}) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  try { return await createGroupHandler(createFanpageDependencies())(operation, request, params); } catch { return groupsUnavailable(); }
}

import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupActivityHandler, groupActivityFailure, type GroupActivityOperation } from "./routes";
export async function groupActivityRoute(operation: GroupActivityOperation, request: Request, params: { id?: string; itemId?: string; subId?: string } = {}) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  try { return await createGroupActivityHandler(createFanpageDependencies())(operation, request, params); } catch (error) { return groupActivityFailure(error); }
}

import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupEarningsHandler, groupEarningsFailure } from "./routes";
export async function groupEarningsRoute(request: Request, params: { id: string; entryKey?: string }) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUP_EARNINGS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
  try { return await createGroupEarningsHandler(createFanpageDependencies())(request, params); }
  catch (error) { return groupEarningsFailure(error); }
}

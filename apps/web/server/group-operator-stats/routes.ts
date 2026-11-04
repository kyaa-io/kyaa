import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { groupOperatorStatsSchema } from "@/features/groups/domain/operator-stats";
export interface GroupOperatorStatsDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function groupOperatorStatsFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, { status: error.status, headers });
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GROUP_STATS_FORBIDDEN")) return Response.json({ error: { code: "GROUP_STATS_FORBIDDEN" } }, { status: 403, headers });
  const invalid = error instanceof z.ZodError || message.includes("GROUP_STATS_INVALID");
  return Response.json({ error: { code: `GROUP_STATS_${invalid ? "INVALID" : "UNAVAILABLE"}` } }, { status: invalid ? 400 : 503, headers });
}
export function createGroupOperatorStatsHandler(deps: GroupOperatorStatsDependencies) {
  return async (request: Request, params: { id: string }) => {
    try {
      const actor = await deps.authorize(request.headers.get("authorization"));
      const page = z.uuid().parse(params.id);
      const query = new URL(request.url).searchParams;
      for (const key of query.keys()) if (key !== "days" || query.getAll(key).length !== 1) throw new Error("GROUP_STATS_INVALID");
      const days = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30)])).parse(query.get("days") ?? 7);
      const raw = await deps.rpc("read_group_operator_stats", { p_actor: actor.appUserId, p_page_id: page, p_days: days });
      const parsed = groupOperatorStatsSchema.safeParse(raw);
      if (!parsed.success) throw new Error("GROUP_STATS_UNAVAILABLE");
      return Response.json(parsed.data, { headers });
    } catch (error) { return groupOperatorStatsFailure(error); }
  };
}

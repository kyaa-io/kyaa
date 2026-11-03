import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { groupEarningsSchema, groupEarningDetailSchema, groupEarningKeySchema } from "@/features/groups/domain/earnings";
export interface GroupEarningsDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export function groupEarningsFailure(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, { status: error.status, headers });
  const message = error instanceof Error ? error.message : "";
  const invalid = error instanceof z.ZodError || message.includes("GROUP_EARNINGS_INVALID");
  const missing = message.includes("GROUP_EARNINGS_NOT_FOUND");
  return Response.json({ error: { code: `GROUP_EARNINGS_${invalid ? "INVALID" : missing ? "NOT_FOUND" : "UNAVAILABLE"}` } }, { status: invalid ? 400 : missing ? 404 : 503, headers });
}
export function createGroupEarningsHandler(deps: GroupEarningsDependencies) {
  return async (request: Request, params: { id: string; entryKey?: string }) => {
    try {
      const owner = await deps.authorize(request.headers.get("authorization"));
      const page = z.uuid().parse(params.id);
      const query = new URL(request.url).searchParams;
      const allowed = params.entryKey === undefined ? ["limit", "cursor"] : [];
      for (const key of query.keys()) if (!allowed.includes(key) || query.getAll(key).length !== 1) throw new Error("GROUP_EARNINGS_INVALID");
      const detail = params.entryKey !== undefined;
      const args = detail
        ? { p_entry_key: groupEarningKeySchema.parse(params.entryKey) }
        : { p_limit: z.coerce.number().int().min(1).max(100).parse(query.get("limit") ?? 30), p_cursor: z.string().min(1).max(2048).nullable().parse(query.get("cursor")) };
      const raw = await deps.rpc(detail ? "read_owned_group_earning" : "read_owned_group_earnings", { p_actor: owner.appUserId, p_page_id: page, ...args });
      const parsed = (detail ? groupEarningDetailSchema : groupEarningsSchema).safeParse(raw);
      if (!parsed.success) throw new Error("GROUP_EARNINGS_UNAVAILABLE");
      return Response.json(parsed.data, { headers });
    } catch (error) { return groupEarningsFailure(error); }
  };
}

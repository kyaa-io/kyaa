import "server-only";
import { z } from "zod";
import { tierChangesSchema, tierHistorySchema, tierSeenBodySchema } from "@/features/tier-history/domain/tier-history";
import { boundedJson } from "@/server/certification/certification-http";
import { dukjilFailure } from "@/server/dukjil/routes";

export interface TierHistoryDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
}
const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const checked = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("DUKJIL_UNAVAILABLE");
  return parsed.data;
};

/** 261107-2 D11. Reading the changes also records them (observe_fan_tiers is idempotent: an unchanged tier writes nothing). */
export function createTierHistoryHandlers(deps: TierHistoryDependencies) {
  const run = async (action: () => Promise<Response>) => { try { return await action(); } catch (error) { return dukjilFailure(error); } };
  return {
    changes: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "ko";
      const raw = await deps.rpc("observe_fan_tiers", { p_app_user_id: appUserId, p_locale: locale });
      return Response.json(checked(tierChangesSchema, raw), { headers: privateHeaders });
    }),
    seen: (request: Request) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      const body = tierSeenBodySchema.parse(await boundedJson(request, 4096));
      const marked = await deps.rpc("mark_fan_tier_changes_seen", { p_app_user_id: appUserId, p_ids: body.ids });
      return Response.json({ marked: typeof marked === "number" ? marked : 0 }, { headers: privateHeaders });
    }),
    history: (request: Request, passportId: string) => run(async () => {
      const { appUserId } = await deps.authorize(request.headers.get("authorization"));
      z.uuid().parse(passportId);
      const raw = await deps.rpc("read_fan_tier_history", { p_app_user_id: appUserId, p_passport_id: passportId });
      if (raw === null) throw new Error("PASSPORT_NOT_FOUND");
      return Response.json(checked(tierHistorySchema, raw), { headers: privateHeaders });
    }),
  };
}

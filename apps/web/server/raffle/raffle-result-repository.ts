import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { ownedRaffleListSchema, ownedRaffleResultSchema, type OwnedRaffleList, type OwnedRaffleResult } from "../../features/benefit/domain/raffle-result";

export interface RaffleResultRepository {
  find(input: { appUserId: string; benefitId: string; locale: "ko" | "en" }): Promise<OwnedRaffleResult | null>;
  list(input: { appUserId: string; locale: "ko" | "en"; cursor: string | null }): Promise<OwnedRaffleList>;
}

/** One row the schema refuses must not take the whole history down: it is left out and logged by its ids only. */
function parseOwnedList(data: unknown): OwnedRaffleList {
  const whole = ownedRaffleListSchema.safeParse(data);
  if (whole.success) return whole.data;
  const value = data as { items?: unknown; nextCursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) throw whole.error;
  const items = value.items.flatMap((item) => {
    const parsed = ownedRaffleResultSchema.safeParse(item);
    if (parsed.success) return [parsed.data];
    const row = item as { campaignId?: unknown; benefitId?: unknown } | null;
    console.error("RAFFLE_RESULT_ROW_REFUSED", { campaignId: row?.campaignId, benefitId: row?.benefitId, paths: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return [];
  });
  return ownedRaffleListSchema.parse({ items, nextCursor: value.nextCursor ?? null });
}

export function createSupabaseRaffleResultRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Pick<SupabaseClient, "rpc">): RaffleResultRepository {
  const db = client ?? createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async find(input) {
      const { data, error } = await db.rpc("get_owned_raffle_result", {
        p_app_user_id: input.appUserId, p_benefit_id: input.benefitId, p_locale: input.locale,
      });
      if (error) throw new Error("RAFFLE_RESULT_UNAVAILABLE");
      return data === null ? null : ownedRaffleResultSchema.parse(data);
    },
    async list(input) {
      const { data, error } = await db.rpc("get_owned_raffles", {
        p_app_user_id: input.appUserId, p_locale: input.locale, p_cursor: input.cursor, p_limit: 20,
      });
      if (error) { console.error("RAFFLE_RESULT_LIST_FAILED", { code: error.code }); throw new Error("RAFFLE_RESULT_UNAVAILABLE"); }
      return parseOwnedList(data);
    },
  };
}

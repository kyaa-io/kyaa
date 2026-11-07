import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { ownedRaffleListSchema, ownedRaffleResultSchema, type OwnedRaffleList, type OwnedRaffleResult } from "../../features/benefit/domain/raffle-result";

export interface RaffleResultRepository {
  find(input: { appUserId: string; benefitId: string; locale: "ko" | "en" }): Promise<OwnedRaffleResult | null>;
  list(input: { appUserId: string; locale: "ko" | "en"; cursor: string | null }): Promise<OwnedRaffleList>;
}

const rowIds = (value: unknown) => { const row = value as { campaignId?: unknown; benefitId?: unknown } | null; return { campaignId: row?.campaignId, benefitId: row?.benefitId }; };

/** A stored image the rule refuses never costs the fan their result: only the image is cleared. */
function parseOwnedRow(value: unknown) {
  const parsed = ownedRaffleResultSchema.safeParse(value);
  if (parsed.success || !parsed.error.issues.every((issue) => issue.path[0] === "imageUrl")) return parsed;
  console.error("RAFFLE_RESULT_IMAGE_CLEARED", rowIds(value));
  return ownedRaffleResultSchema.safeParse({ ...(value as object), imageUrl: null });
}

/** A row the schema refuses is left out and logged by its ids only, so one row cannot take the history down. A winning row is never left out: the read fails instead, so the fault shows. */
function parseOwnedList(data: unknown): OwnedRaffleList {
  const value = data as { items?: unknown; nextCursor?: unknown } | null;
  if (!value || !Array.isArray(value.items)) return ownedRaffleListSchema.parse(data);
  const items = value.items.flatMap((item) => {
    const parsed = parseOwnedRow(item);
    if (parsed.success) return [parsed.data];
    console.error("RAFFLE_RESULT_ROW_REFUSED", { ...rowIds(item), paths: parsed.error.issues.map((issue) => issue.path.join(".")) });
    if ((item as { state?: unknown } | null)?.state === "won") throw new Error("RAFFLE_RESULT_WON_ROW_REFUSED");
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
      if (data === null) return null;
      const parsed = parseOwnedRow(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
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

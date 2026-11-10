import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { giftSchema, giftUnreadSchema, type Gift, type GiftUnread } from "../../features/gifts/domain/gift";

export interface GiftRepository {
  list(input: { appUserId: string; locale: "ko" | "en" }): Promise<Gift[]>;
  find(input: { appUserId: string; rewardResultId: string; locale: "ko" | "en" }): Promise<Gift | null>;
  /** Null when the id is not a published win of this fan. */
  markRead(input: { appUserId: string; rewardResultId: string }): Promise<GiftUnread | null>;
  unread(input: { appUserId: string }): Promise<GiftUnread>;
}

export function createSupabaseGiftRepository(config: { url: string | undefined; serviceRoleKey: string | undefined }, client?: Pick<SupabaseClient, "rpc">): GiftRepository {
  const db = client ?? createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async list(input) {
      const { data, error } = await db.rpc("get_owned_gifts", { p_app_user_id: input.appUserId, p_locale: input.locale });
      if (error) throw new Error("GIFTS_UNAVAILABLE");
      if (!Array.isArray(data)) throw new Error("GIFTS_UNAVAILABLE");
      // A win whose raffle item can no longer be projected has nothing to show; the others still open.
      return data.flatMap((row) => {
        const parsed = giftSchema.safeParse(row);
        if (parsed.success) return [parsed.data];
        console.error("GIFT_ROW_REFUSED", { rewardResultId: (row as { rewardResultId?: unknown } | null)?.rewardResultId });
        return [];
      });
    },
    async find(input) {
      const { data, error } = await db.rpc("get_owned_gift", { p_app_user_id: input.appUserId, p_reward_result_id: input.rewardResultId, p_locale: input.locale });
      if (error) throw new Error("GIFTS_UNAVAILABLE");
      if (data === null) return null;
      return giftSchema.parse(data);
    },
    async markRead(input) {
      const { data, error } = await db.rpc("mark_owned_gift_read", { p_app_user_id: input.appUserId, p_reward_result_id: input.rewardResultId });
      if (error) throw new Error("GIFTS_UNAVAILABLE");
      return data === null ? null : giftUnreadSchema.parse(data);
    },
    async unread(input) {
      const { data, error } = await db.rpc("get_owned_gift_unread", { p_app_user_id: input.appUserId });
      if (error) throw new Error("GIFTS_UNAVAILABLE");
      return giftUnreadSchema.parse(data);
    },
  };
}

import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import { bannerSlotsByArea, homeBannerSchema, type BannerSlotArea, type BannerSlotMap, type HomeBanner } from "../../features/home/domain/home-banner";

type RpcClient = Pick<SupabaseClient, "rpc">;

// Slot RPCs return flat video fields. Public banners use the carousel's video shape.
function parsePublishedBanner(row: unknown) {
  if (row && typeof row === "object" && !Array.isArray(row) &&
      ("desktopVideo" in row || "mobileVideo" in row)) {
    const { desktopVideo, mobileVideo, ...banner } = row as Record<string, unknown>;
    if (desktopVideo === null && mobileVideo === null) return homeBannerSchema.safeParse(banner);
    if (!("video" in banner)) {
      return homeBannerSchema.safeParse({
        ...banner,
        video: { desktop: desktopVideo, mobile: mobileVideo ?? null },
      });
    }
  }
  return homeBannerSchema.safeParse(row);
}

export function createHomeBannerRepository(
  config: { url: string | undefined; serviceRoleKey: string | undefined },
  client?: RpcClient,
) {
  const db = client ?? createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async list(locale: "ko" | "en", placement: "home" | "groups" = "home"): Promise<HomeBanner[]> {
      const { data, error } = await db.rpc(placement === "groups" ? "read_published_discovery_banners" : "read_published_home_banners", { p_locale: locale });
      if (error) throw new Error(`HOME_BANNER_READ_FAILED: ${error.message}`);
      if (!Array.isArray(data)) throw new Error("HOME_BANNER_READ_FAILED: invalid RPC response");
      return data.flatMap((row) => {
        const parsed = parsePublishedBanner(row);
        return parsed.success ? [parsed.data] : [];
      });
    },
    /** The slot banners of one area. A banner that fails the contract or sits in another area's slot is left out, so that slot folds. */
    async listSlots(locale: "ko" | "en", area: BannerSlotArea): Promise<BannerSlotMap> {
      const { data, error } = await db.rpc("read_published_slot_banners", { p_locale: locale, p_area: area });
      if (error) throw new Error(`HOME_BANNER_READ_FAILED: ${error.message}`);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("HOME_BANNER_READ_FAILED: invalid RPC response");
      const slots: BannerSlotMap = {};
      for (const slot of bannerSlotsByArea[area]) {
        const parsed = parsePublishedBanner((data as Record<string, unknown>)[slot]);
        if (parsed.success && parsed.data.placement === slot) slots[slot] = parsed.data;
      }
      return slots;
    },
  };
}

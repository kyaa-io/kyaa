"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { homeBannerSchema, type BannerSlotArea, type BannerSlotMap } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";

const responseSchema = z.object({ slots: z.record(z.string(), z.unknown()) }).strict();
const requests = new Map<string, Promise<BannerSlotMap>>();

/** One request per area and language, shared by every slot on the page. A failure folds every slot of that area. */
function loadSlots(area: BannerSlotArea, locale: AppLocale): Promise<BannerSlotMap> {
  const key = `${area}:${locale}`;
  let request = requests.get(key);
  if (!request) {
    request = fetch(`/api/public/banner-slots?area=${area}&locale=${encodeURIComponent(locale)}`)
      .then(response => response.ok ? response.json() : { slots: {} })
      .then(body => {
        const slots: BannerSlotMap = {};
        for (const [slot, value] of Object.entries(responseSchema.parse(body).slots)) {
          const banner = homeBannerSchema.safeParse(value);
          if (banner.success && banner.data.placement === slot) slots[slot as keyof BannerSlotMap] = banner.data;
        }
        return slots;
      })
      .catch(() => { requests.delete(key); return {}; });
    requests.set(key, request);
  }
  return request;
}

export function useBannerSlots(area: BannerSlotArea, locale: AppLocale): BannerSlotMap {
  const [slots, setSlots] = useState<BannerSlotMap>({});
  useEffect(() => {
    let active = true;
    void loadSlots(area, locale).then(next => { if (active) setSlots(next); });
    return () => { active = false; };
  }, [area, locale]);
  return slots;
}

/** Tests only. */
export function resetBannerSlotRequests() { requests.clear(); }

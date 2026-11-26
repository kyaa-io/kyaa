"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { AD_REWARD_POINTS, adRewardResultSchema, adRewardTodaySchema, isRewardedAd, type AdRewardToday } from "@/features/home/domain/ad-reward";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";

const TODAY_PATH = "/api/me/dukjil/ad-reward";

// One read of today's ad rewards per signed-in owner, shared by every ad banner on the page. It is never cancelled by one banner
// re-rendering (a shared, abortable read left the other banners waiting); a failure is forgotten so the next mount reads again.
const todayReads = new Map<string, Promise<AdRewardToday | null>>();
function readToday(ownerKey: string, request: ReturnType<typeof useGroupRequest>["request"]) {
  let read = todayReads.get(ownerKey);
  if (!read) {
    read = request(TODAY_PATH).then(value => adRewardTodaySchema.parse(value)).catch(() => { todayReads.delete(ownerKey); return null; });
    todayReads.set(ownerKey, read);
  }
  return read;
}
/** Test hook. */
export const resetAdRewardReads = () => todayReads.clear();

/** "points": the +5 pill. "done": paid today. null: nothing (not an ad, the session or today's read is not known yet, or the 10 are used). */
export type AdRewardMark = "points" | "done" | null;

/**
 * The reward of one ad banner. `claim` is the banner link's click handler: a signed-in member's first click of the day asks the server
 * to pay; it never stops the link, and a failed call leaves the badge as it was. A signed-out viewer is shown the reward and earns nothing.
 */
export function useAdReward(banner: Pick<HomeBanner, "id" | "category" | "placement">) {
  const rewarded = isRewardedAd(banner);
  const auth = useGroupRequest();
  const { request, authenticated, ownerKey } = auth;
  // The server renders no badge; the first client render must match it, so the session counts as known only after mounting.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && auth.ready;
  const [today, setToday] = useState<{ ownerKey: string; data: AdRewardToday | null }>();
  useEffect(() => {
    if (!rewarded || !ready || !authenticated) return;
    let live = true;
    void readToday(ownerKey, request).then(data => { if (live) setToday({ ownerKey, data }); });
    return () => { live = false; };
  }, [authenticated, ownerKey, ready, request, rewarded]);
  const todayData = today?.ownerKey === ownerKey ? today.data : null;
  const [paid, setPaid] = useState(false);
  const sending = useRef(false);
  const done = paid || (todayData?.claimed.includes(banner.id) ?? false);
  const mark: AdRewardMark = !rewarded || !ready ? null
    : !authenticated ? "points"
      : done ? "done"
        : todayData && todayData.remaining > 0 ? "points" : null;
  const claim = useCallback(() => {
    if (!rewarded || !ready || !authenticated || done || sending.current) return;
    sending.current = true;
    void request(TODAY_PATH, { method: "POST", body: JSON.stringify({ bannerId: banner.id }), keepalive: true })
      .then(value => { const result = adRewardResultSchema.safeParse(value); if (result.success && result.data.points > 0) { todayReads.delete(ownerKey); setPaid(true); } })
      .catch(() => undefined)
      .finally(() => { sending.current = false; });
  }, [authenticated, banner.id, done, ownerKey, ready, request, rewarded]);
  return { mark, claim };
}

/** The badge on an ad banner: the shared point pill (+5) or the shared done badge. */
export function AdRewardBadge({ mark, locale, className }: { mark: AdRewardMark; locale: AppLocale; className?: string }) {
  if (mark === "points") return <span className={className} data-ad-reward="points"><EarnBadge variant="inline" locale={locale} points={AD_REWARD_POINTS} /></span>;
  if (mark === "done") return <span className={className} data-ad-reward="done"><EarnBadge variant="done" locale={locale} /></span>;
  return null;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { AD_REWARD_POINTS, adRewardResultSchema, adRewardTodaySchema, isRewardedAd, type AdRewardToday } from "@/features/home/domain/ad-reward";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";

import { formatMileage } from "@/i18n/format-mileage";

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

type AdRewardMark = { kind: "points" | "received"; points: number } | null;

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
  const [paid, setPaid] = useState<{ ownerKey: string; bannerId: string; points: number }>();
  const sending = useRef(false);
  const received = paid?.ownerKey === ownerKey && paid.bannerId === banner.id
    ? paid.points
    : todayData?.claimed.includes(banner.id) ? todayData.points : null;
  const mark: AdRewardMark = !rewarded || !ready ? null
    : !authenticated ? { kind: "points", points: AD_REWARD_POINTS }
      : received !== null ? { kind: "received", points: received }
        : todayData && todayData.remaining > 0 ? { kind: "points", points: todayData.points } : null;
  const claim = useCallback(() => {
    if (!rewarded || !ready || !authenticated || received !== null || sending.current) return;
    sending.current = true;
    void request(TODAY_PATH, { method: "POST", body: JSON.stringify({ bannerId: banner.id }), keepalive: true })
      .then(value => { const result = adRewardResultSchema.safeParse(value); if (result.success && result.data.points > 0) { todayReads.delete(ownerKey); setPaid({ ownerKey, bannerId: banner.id, points: result.data.points }); } })
      .catch(() => undefined)
      .finally(() => { sending.current = false; });
  }, [authenticated, banner.id, received, ownerKey, ready, request, rewarded]);
  return { mark, claim };
}

const rewardLabels = {
  ko: (amount) => [`광고 ${amount}`, `${amount} 받음`],
  en: (amount) => [`Ad ${amount}`, `Received ${amount}`],
  ja: (amount) => [`広告 ${amount}`, `${amount} 獲得済み`],
  "zh-Hans": (amount) => [`广告 ${amount}`, `已获 ${amount}`],
  "zh-Hant": (amount) => [`廣告 ${amount}`, `已獲 ${amount}`],
  es: (amount) => [`Anuncio ${amount}`, `Has recibido ${amount}`],
  id: (amount) => [`Iklan ${amount}`, `Diterima ${amount}`],
  vi: (amount) => [`QC ${amount}`, `Đã nhận ${amount}`],
  th: (amount) => [`โฆษณา ${amount}`, `ได้รับ ${amount} แล้ว`],
  pt: (amount) => [`Anúncio ${amount}`, `Você recebeu ${amount}`],
  fr: (amount) => [`Pub ${amount}`, `${amount} reçus`],
  ru: (amount) => [`Реклама ${amount}`, `Получено ${amount}`],
  mn: (amount) => [`Зар ${amount}`, `${amount} авсан`],
} satisfies Record<AppLocale, (amount: string) => [string, string]>;

export function AdRewardBadge({ mark, locale }: { mark: AdRewardMark; locale: AppLocale }) {
  if (!mark) return null;
  const [offer, received] = rewardLabels[locale](locale === "en" ? formatMileage(mark.points, locale, "always") : new Intl.NumberFormat(locale, { signDisplay: "always" }).format(mark.points));
  return <span data-ad-reward={mark.kind} role="status"><EarnBadge variant="inline" locale={locale} points={mark.points} pointLabel={mark.kind === "received" ? received : offer} /></span>;
}

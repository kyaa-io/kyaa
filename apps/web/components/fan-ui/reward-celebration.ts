"use client";

import type { AppLocale } from "@/i18n/locales";
import { closeFanToast, showFanToast } from "./fan-toast";
import styles from "./reward-celebration.module.css";

/** Same coin as `EarnBadge` (features/dukjil/ui/earn-badge.tsx). */
const POINT_COIN_SRC = "/images/economy/point-coin.svg";

/**
 * 261107-2 D8. The one way the app says "you earned something": a coin badge pops up from where the fan acted and the shared
 * toast reads "+20P · 도장 1". Any screen calls it right after the server confirms a grant.
 *
 *   celebrateReward({ locale, points: 20, stamps: 1, anchor: event.currentTarget, label: "글쓰기 미션 완료" })
 *
 * - `points` / `stamps`: what the server granted (0 or missing parts are left out; nothing granted → nothing happens).
 * - `anchor`: the element the fan pressed; the badge rises from its top centre. Without it the badge rises mid-screen.
 * - `label`: optional second line (what was completed). Never a sentence of explanation.
 * - Grants within 1.2 s add up into one badge and one toast (a like right after a comment says "+4P", not two toasts).
 * - prefers-reduced-motion: no movement; the badge appears in place and fades, the toast is the same.
 * A full-screen stamp moment (D3) runs its own artwork and then calls this for the toast.
 */
export type RewardCelebration = Readonly<{ locale: AppLocale; points?: number; stamps?: number; label?: string; anchor?: Element | null;
  /** The amounts are already a running total of close grants (usePointRewardBurst merges on its own); replace instead of adding. */
  total?: boolean }>;

export const REWARD_MERGE_MS = 1200;
const BADGE_MS = 900;

const unit: Record<AppLocale, { points: (n: string) => string; stamps: (n: string, count: number) => string }> = {
  ko: { points: n => `+${n}P`, stamps: n => `도장 ${n}` },
  en: { points: n => `+${n}P`, stamps: (n, c) => `${n} ${c === 1 ? "stamp" : "stamps"}` },
  ja: { points: n => `+${n}P`, stamps: n => `スタンプ ${n}` },
  "zh-Hans": { points: n => `+${n}P`, stamps: n => `印章 ${n}` },
  "zh-Hant": { points: n => `+${n}P`, stamps: n => `印章 ${n}` },
  es: { points: n => `+${n}P`, stamps: (n, c) => `${n} ${c === 1 ? "sello" : "sellos"}` },
  id: { points: n => `+${n}P`, stamps: n => `${n} stempel` },
  vi: { points: n => `+${n}P`, stamps: n => `${n} con dấu` },
  th: { points: n => `+${n}P`, stamps: n => `แสตมป์ ${n}` },
  pt: { points: n => `+${n}P`, stamps: (n, c) => `${n} ${c === 1 ? "selo" : "selos"}` },
  fr: { points: n => `+${n}P`, stamps: (n, c) => `${n} ${c === 1 ? "tampon" : "tampons"}` },
  ru: { points: n => `+${n}P`, stamps: n => `Штампы: ${n}` },
};

/** "+20P · 도장 1", "+20P", "도장 1", or "" when nothing was granted. */
export function rewardSummary(locale: AppLocale, points = 0, stamps = 0) {
  const u = unit[locale] ?? unit.en, parts: string[] = [];
  if (points > 0) parts.push(u.points(points.toLocaleString(locale)));
  if (stamps > 0) parts.push(u.stamps(stamps.toLocaleString(locale), stamps));
  return parts.join(" · ");
}

let merged: { points: number; stamps: number; at: number; toastId: string } | null = null;

export function celebrateReward({ locale, points = 0, stamps = 0, label, anchor, total: alreadyTotal = false }: RewardCelebration) {
  const p = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0, s = Number.isFinite(stamps) && stamps > 0 ? Math.floor(stamps) : 0;
  if (!p && !s) return;
  const now = Date.now(), joined = merged && now - merged.at <= REWARD_MERGE_MS ? merged : null;
  const total = alreadyTotal ? { points: p, stamps: s } : { points: (joined?.points ?? 0) + p, stamps: (joined?.stamps ?? 0) + s };
  if (joined?.toastId) closeFanToast(joined.toastId);
  const title = rewardSummary(locale, total.points, total.stamps);
  const toastId = showFanToast({ title, description: label, tone: "success" });
  merged = { ...total, at: now, toastId };
  // The badge is the point badge of the whole app (coin + "+20"); a stamp-only grant shows its words instead.
  popBadge(total.points > 0 ? `+${total.points.toLocaleString(locale)}` : title, total.points > 0, anchor);
}

function popBadge(text: string, coin: boolean, anchor?: Element | null) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`[data-reward-badge]`).forEach(node => node.remove());
  const badge = document.createElement("span");
  badge.className = styles.badge;
  badge.setAttribute("data-reward-badge", "");
  // Screens and their tests already look for this name; it now marks the one shared badge.
  badge.setAttribute("data-testid", "point-reward-burst");
  badge.setAttribute("aria-hidden", "true");
  if (coin) {
    const image = document.createElement("img");
    image.src = POINT_COIN_SRC; image.width = 20; image.height = 20; image.alt = "";
    badge.append(image);
  }
  const amount = document.createElement("span");
  amount.textContent = text;
  badge.append(amount);
  const rect = anchor?.getBoundingClientRect();
  if (rect && rect.width + rect.height > 0) {
    badge.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    badge.style.top = `${Math.round(Math.max(rect.top, 48))}px`;
  } else {
    badge.dataset.centered = "";
  }
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) badge.dataset.reduced = "";
  document.body.append(badge);
  window.setTimeout(() => badge.remove(), reduced ? BADGE_MS * 2 : BADGE_MS);
}

/** Tests only. */
export function resetRewardCelebration() { merged = null; }

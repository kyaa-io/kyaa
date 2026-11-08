"use client";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { missionDoneTitle } from "@/i18n/catalogs/components__fan-ui__point-reward-burst";
import type { AppLocale } from "@/i18n/locales";
import { celebrateStamp } from "@/features/dukjil/ui/stamp-slam";

/** C8 + D8: a mission finished outside 덕질 (writing on the board, commenting under a post) is told once by the shared reward
 * toast ("+3P · 스탬프 1", second line "댓글 미션 완료"). Only what the server reported is named. A mission that stamped lands its
 * stamp over the screen first (D3), then the same toast. */
export function showMissionRewardToast(locale: AppLocale, mission: "post" | "comment", reward: { points: number; stamps?: number }) {
  const points = Number.isFinite(reward.points) && reward.points > 0 ? reward.points : 0, stamps = reward.stamps ?? 0;
  if (!points && stamps <= 0) return;
  const label = missionDoneTitle(locale, dukjilText(locale, mission === "post" ? "dukjilTilePost" : "dukjilTileComment"));
  if (stamps > 0) void celebrateStamp({ locale, points, stamps, label });
  else celebrateReward({ locale, points, label });
}

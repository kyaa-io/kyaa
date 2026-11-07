"use client";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { missionDoneTitle, pointRewardLine } from "@/i18n/catalogs/components__fan-ui__point-reward-burst";
import type { AppLocale } from "@/i18n/locales";

/** C8: a mission finished outside 덕질 (writing on the board, commenting under a post) is told once by a toast:
 * "댓글 미션 완료" / "포인트 +3 · 스탬프 +1". Only what the server reported is named; no stamp, no stamp part. 덕질 itself keeps the reward burst. */
export function showMissionRewardToast(locale: AppLocale, mission: "post" | "comment", reward: { points: number; stamps?: number }) {
  if (!Number.isFinite(reward.points) || reward.points <= 0) return;
  const label = dukjilText(locale, mission === "post" ? "dukjilTilePost" : "dukjilTileComment");
  showFanToast({ title: missionDoneTitle(locale, label), description: pointRewardLine(locale, reward.points, reward.stamps ?? 0), tone: "success" });
}

import { showFanToast } from "@/components/fan-ui/fan-toast";
import type { useReadingCopy } from "./reading-ui";

/** 공유 완료 응답의 보상을 토스트로 알린다. 알린 것이 있으면 true. */
export async function showShareReward(
  response: Response,
  text: ReturnType<typeof useReadingCopy>,
) {
  if (!response.ok) return false;
  const { reward } = await response.json();
  const parts = [];
  if (reward?.pass === 1) parts.push(text("shareQuestionBonus"));
  if (reward?.exp === 5) parts.push(text("shareAffinityBonus"));
  if (parts.length) showFanToast({ title: parts.join(" · "), tone: "success" });
  return parts.length > 0;
}

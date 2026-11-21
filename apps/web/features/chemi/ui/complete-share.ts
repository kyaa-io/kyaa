import { showFanToast } from "@/components/fan-ui/fan-toast";

type RewardLabel = "shareAskBonus" | "shareAffinityBonus";

export async function completeShare(
  shareId: string,
  via: "copy" | "send",
  headers: HeadersInit,
  text: (key: RewardLabel, vars?: { name: string }) => string,
  name: string,
) {
  // The copy or native share has already succeeded. Only announce confirmed grants.
  try {
    const response = await fetch(`/api/chemi/shares/${encodeURIComponent(shareId)}/done`, {
      method: "POST", headers, body: JSON.stringify({ via }),
    });
    if (!response.ok) return;
    const { reward } = await response.json();
    const labels = [];
    if (reward?.pass === 1) labels.push(text("shareAskBonus"));
    if (reward?.exp === 5) labels.push(text("shareAffinityBonus", { name }));
    if (labels.length) showFanToast({ title: labels.join(" · "), tone: "success" });
    return { pass: reward?.pass === 1 ? 1 : 0, exp: reward?.exp === 5 ? 5 : 0 };
  } catch {
    // A missing receipt cannot establish whether the reward was granted.
  }
}

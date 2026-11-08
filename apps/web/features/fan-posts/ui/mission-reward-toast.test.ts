import { beforeEach, expect, it, vi } from "vitest";
const shown = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: (options: unknown) => { shown.calls.push(options); return ""; } }));
const slam = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/features/dukjil/ui/stamp-slam", () => ({ celebrateStamp: async (_reward: unknown, then?: () => void) => { slam.calls += 1; then?.(); } }));
import { showMissionRewardToast } from "./mission-reward-toast";

beforeEach(() => { shown.calls = []; slam.calls = 0; });
it("names the mission and what it paid: points and the stamp the server reported (C8)", async () => {
  showMissionRewardToast("ko", "comment", { points: 3, stamps: 1 });
  showMissionRewardToast("ko", "post", { points: 20 });
  showMissionRewardToast("en", "comment", { points: 3, stamps: 1 });
  await Promise.resolve();
  // D3: the two stamped missions land their stamp first; the one without a stamp shows only the notice.
  expect(slam.calls).toBe(2);
  expect(shown.calls).toEqual([
    { title: "댓글 미션 완료", description: "포인트 +3 · 스탬프 +1", tone: "success" },
    { title: "글쓰기 미션 완료", description: "포인트 +20", tone: "success" },
    { title: "Comment mission done", description: "Points +3 · Stamp +1", tone: "success" },
  ]);
});
it("says nothing without paid points", () => {
  showMissionRewardToast("ko", "comment", { points: 0, stamps: 1 });
  expect(shown.calls).toEqual([]);
});

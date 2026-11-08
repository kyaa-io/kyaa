import { beforeEach, expect, it, vi } from "vitest";
const shown = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: (options: unknown) => { shown.calls.push(options); } }));
const slam = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/features/dukjil/ui/stamp-slam", () => ({ celebrateStamp: async (reward: unknown) => { slam.calls.push(reward); } }));
import { showMissionRewardToast } from "./mission-reward-toast";

beforeEach(() => { shown.calls = []; slam.calls = []; });
it("C8·D8: names the mission under the shared reward toast; a stamped mission lands its stamp first (D3)", () => {
  showMissionRewardToast("ko", "comment", { points: 3, stamps: 1 });
  showMissionRewardToast("ko", "post", { points: 20 });
  showMissionRewardToast("en", "comment", { points: 3, stamps: 1 });
  expect(slam.calls).toEqual([
    { locale: "ko", points: 3, stamps: 1, label: "댓글 미션 완료" },
    { locale: "en", points: 3, stamps: 1, label: "Comment mission done" },
  ]);
  expect(shown.calls).toEqual([{ locale: "ko", points: 20, label: "글쓰기 미션 완료" }]);
});
it("says nothing when nothing was paid, and still lands a stamp issued while the points were capped", () => {
  showMissionRewardToast("ko", "comment", { points: 0 });
  showMissionRewardToast("ko", "comment", { points: 0, stamps: 0 });
  expect(shown.calls).toEqual([]);
  expect(slam.calls).toEqual([]);
  showMissionRewardToast("ko", "comment", { points: 0, stamps: 1 });
  expect(slam.calls).toEqual([{ locale: "ko", points: 0, stamps: 1, label: "댓글 미션 완료" }]);
});

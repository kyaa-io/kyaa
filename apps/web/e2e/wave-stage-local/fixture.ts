import type { WaveStage } from "../../features/wave-stage/domain/wave-stage";
import type { PublicDashboardData } from "../../features/public-live-dashboard/domain/public-live-dashboard";
import type { WaveStagePresentationResponse } from "../../features/wave-stage/domain/presentation";
import type { WaveStageTikTokResponse } from "../../features/wave-stage/domain/tiktok-metrics";
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const stageFixture: WaveStage = {
  eventKey: "kyaa-wave-20261022", asOf: "2026-10-22T11:15:30Z", liveSlug: "changha-kyaa-wave-20261022", drawConflict: false, draw: null,
  creators: [
    { slug: "changha", name: "창하 · CHANGHA", campaignId: id(1), revision: 1, entryClosesAt: "2026-10-22T12:30:00Z", participantCount: 1284, reservationCount: 862, weightedEntryCount: 2146, photocardEligibleCount: 1284 },
    { slug: "wena", name: "We;Na", campaignId: id(2), revision: 1, entryClosesAt: "2026-10-22T12:30:00Z", participantCount: 946, reservationCount: 620, weightedEntryCount: 1566, photocardEligibleCount: 946 },
  ],
  prizes: [
    { benefitId: id(3), creatorSlug: "changha", kind: "coffee_chat", title: "커피챗", winnerQuantity: 20 },
    { benefitId: id(4), creatorSlug: "changha", kind: "hotel_coffee", title: "호텔 커피", winnerQuantity: 5 },
    { benefitId: id(5), creatorSlug: "wena", kind: "hotel_coffee", title: "호텔 커피", winnerQuantity: 5 },
  ],
};
export function completedStage(longNames = false): WaveStage {
  const names = longNames ? ["Alexandra Kim-Santos", "김하늘별빛응원단", "Nguyễn Thị Minh Anh", "Samantha Rose Williams", "ธนพร ศรีสวัสดิ์"] : ["하늘***", "민지***", "지우***", "수빈***", "지민***", "별빛***", "유진***", "Alex***", "Mina***", "Sofia***"];
  return { ...stageFixture, draw: { executedAt: stageFixture.asOf, publishedAt: stageFixture.asOf, winners: stageFixture.prizes.flatMap(prize => Array.from({ length: prize.winnerQuantity }, (_, index) => ({ benefitId: prize.benefitId, creatorSlug: prize.creatorSlug, displayName: names[index % names.length]!, displayCode: `WAVE-${String(index + 1).padStart(3, "0")}` }))) } };
}
export const metricsFixture: PublicDashboardData = {
  database: { state: "available", approvedParticipation: 42860, participatingBroadcasts: 368, sentHearts: 182495, process: { pending: 48, approved: 42860, rejected: 126 }, asOf: stageFixture.asOf },
  onchain: { state: "available", asOf: stageFixture.asOf, blockTimestamp: stageFixture.asOf, metrics: { currentActionTransactions: 56890, passportCredentials: 5482, mintedCredentials: 18430, uniqueActiveWallets: 6072, lifecycleTransactions: 68120, actionCounts: {} } },
};

// Synthetic data for local UI verification only.
export const presentationFixture: WaveStagePresentationResponse = {
  asOf: stageFixture.asOf, scope: "all", from: null, to: stageFixture.asOf, eventDate: "2026-10-22",
  creators: [
    { slug: "changha", name: "창하 · CHANGHA", reservations: 862, passports: 1048, likes: 1186, comments: 672, engagedFans: 1284, pending: 3, failed: 1 },
    { slug: "wena", name: "We;Na", reservations: 620, passports: 738, likes: 874, comments: 426, engagedFans: 946, pending: 2, failed: 0 },
  ],
  onchain: { state: "available", contractAddress: "0x1111111111111111111111111111111111111111", blockNumber: "7890123", blockHash: `0x${"a".repeat(64)}`, observedAt: stageFixture.asOf, finality: "included", finalizedBlockNumber: "7889900", creators: [
    { slug: "changha", reservations: 860, passports: 1048, likes: 1186, comments: 670, engagedFans: 1280 },
    { slug: "wena", reservations: 620, passports: 738, likes: 874, comments: 426, engagedFans: 946 },
  ] },
};
export const tiktokFixture: WaveStageTikTokResponse = {
  asOf: stageFixture.asOf, creators: [
    { slug: "changha", state: "live", observedAt: stageFixture.asOf, roomId: "123456789", viewers: 2486 },
    { slug: "wena", state: "offline", observedAt: stageFixture.asOf },
  ],
};

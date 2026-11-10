import { describe, expect, it, vi } from "vitest";
import { renderTelegramAlertMessage, SupabaseTelegramAlertQueue, type TelegramAlertSnapshot } from "../src/telegram-alert-worker.js";

const alert: TelegramAlertSnapshot = {
  kind: "sns_ingest_stale", creator_name: "수집 최애", live_title: null, actor_name: null, actor_email: null,
  winner_count: null, occurred_at: "2026-11-10T03:23:00Z", sns_platform: "instagram", sns_last_success_at: "2026-11-09T01:00:00Z",
};
const batchId = "559fe228-ff92-4a85-a3e9-ad83d9e60f8b";
const claim = (alerts: unknown[]) => new SupabaseTelegramAlertQueue({ rpc: vi.fn().mockResolvedValue({ data: { batch_id: batchId, alerts }, error: null }) }).claim("-1001234567890");

describe("Telegram SNS ingest stale source", () => {
  it("renders the creator, platform and last successful collection", async () => {
    const batch = await claim([alert, { ...alert, sns_platform: "tiktok", sns_last_success_at: null }]);
    const text = renderTelegramAlertMessage(batch!.alerts);
    expect(text).toContain("• 수집 최애 Instagram 게시물 수집 24시간 넘게 멈춤");
    expect(text).toContain("마지막 성공: 2026-11-09 10:00:00 KST");
    expect(text).toContain("• 수집 최애 TikTok 게시물 수집 24시간 넘게 멈춤");
    expect(text).toContain("마지막 성공: 기록 없음");
    expect(text).not.toMatch(/이메일|닉네임|undefined/u);
  });

  it.each([
    { sns_platform: undefined }, { sns_platform: "youtube" }, { sns_last_success_at: undefined }, { creator_name: null },
    { actor_email: "private@example.test" }, { kind: "member_joined" },
  ])("rejects invalid or misplaced source context %j", async (change) => {
    await expect(claim([{ ...alert, ...change }])).rejects.toThrow("TELEGRAM_ALERT_INVALID_BATCH");
  });
});

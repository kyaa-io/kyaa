import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderTelegramAlertMessage, SupabaseTelegramAlertQueue, TelegramSendError,
  TelegramAlertWorker, refreshYouTubeLiveStarts, runTelegramAlertWorkerOnce,
  type TelegramAlertSnapshot,
} from "../src/telegram-alert-worker.js";
import { parseNotificationEnv } from "../src/notification-env.js";

const alert: TelegramAlertSnapshot = {
  kind: "youtube_live_started", creator_name: "알림 최애", live_title: null, actor_name: null,
  actor_email: null, winner_count: null, occurred_at: "2026-10-20T03:00:00Z", youtube_video_id: "abcDEF123_-",
};
const batchId = "559fe228-ff92-4a85-a3e9-ad83d9e60f8b";
const env = parseNotificationEnv({
  NOTIFICATION_WORKER_ID: "telegram-live-test", SUPABASE_URL: "https://gmrykvmtmuaeswpajteq.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "s".repeat(48), WEB_PUSH_VAPID_SUBJECT: "mailto:ops@byus.kr",
  WEB_PUSH_VAPID_PUBLIC_KEY: "a".repeat(88), WEB_PUSH_VAPID_PRIVATE_KEY: "b".repeat(43),
  NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", TELEGRAM_ALERT_MODE: "enabled",
  TELEGRAM_BOT_TOKEN: `123456789:${"A".repeat(35)}`, TELEGRAM_CHAT_ID: "-1001234567890",
});

afterEach(() => vi.restoreAllMocks());

describe("Telegram YouTube live starts", () => {
  it("accepts the database payload and renders the creator, detection time and exact broadcast link", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { batch_id: batchId, alerts: [alert] }, error: null });
    const batch = await new SupabaseTelegramAlertQueue({ rpc }).claim(env.telegram.chatId!);
    const text = renderTelegramAlertMessage(batch!.alerts);
    expect(text).toContain("• 알림 최애 YouTube 라이브 시작");
    expect(text).toContain("확인 시각: 2026-10-20 12:00:00 KST");
    expect(text).toContain("https://www.youtube.com/watch?v=abcDEF123_-");
    expect(text).not.toMatch(/이메일|닉네임|undefined/u);
  });

  it.each([
    { youtube_video_id: undefined }, { youtube_video_id: "bad?url" }, { creator_name: null },
    { actor_email: "private@example.test" }, { kind: "member_joined" },
  ])("rejects invalid or misplaced broadcast context %j", async (change) => {
    const rpc = vi.fn().mockResolvedValue({ data: { batch_id: batchId, alerts: [{ ...alert, ...change }] }, error: null });
    await expect(new SupabaseTelegramAlertQueue({ rpc }).claim(env.telegram.chatId!)).rejects.toThrow("TELEGRAM_ALERT_INVALID_BATCH");
  });

  it("refreshes existing shared discovery at the fixed site URL without sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await refreshYouTubeLiveStarts(fetcher);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://kyaa.io/api/public/live-now?v=2", {
      cache: "no-store", redirect: "error", signal: expect.any(AbortSignal),
    });
    fetcher.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(refreshYouTubeLiveStarts(fetcher)).rejects.toThrow("YOUTUBE_LIVE_ALERT_REFRESH_FAILED");
  });

  it("refreshes before claiming and continues existing delivery when discovery fails", async () => {
    const refreshLiveStarts = vi.fn().mockRejectedValue(new Error("website unavailable"));
    const queue = {
      claim: vi.fn().mockResolvedValue({ batchId, alerts: [alert] }), begin: vi.fn().mockResolvedValue(true),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const sender = { sendText: vi.fn().mockResolvedValue(42n) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runTelegramAlertWorkerOnce(env, { queue, sender, refreshLiveStarts })).resolves.toBe(1);
    expect(refreshLiveStarts.mock.invocationCallOrder[0]).toBeLessThan(queue.claim.mock.invocationCallOrder[0]!);
    expect(queue.finish).toHaveBeenCalledWith(batchId, "sent", 42n, null);
    expect(sender.sendText).toHaveBeenCalledTimes(1);
    await runTelegramAlertWorkerOnce({ ...env, telegram: { ...env.telegram, mode: "disabled" } }, { queue, sender, refreshLiveStarts });
    expect(refreshLiveStarts).toHaveBeenCalledTimes(1);
  });

  it("keeps an uncertain send terminal under the existing delivery policy", async () => {
    const queue = {
      claim: vi.fn().mockResolvedValueOnce({ batchId, alerts: [alert] }).mockResolvedValue(null),
      begin: vi.fn().mockResolvedValue(true), finish: vi.fn().mockResolvedValue(undefined),
    };
    const sender = { sendText: vi.fn().mockRejectedValue(new TelegramSendError("unknown")) };
    await new TelegramAlertWorker(queue, sender, env.telegram.chatId!).runOnce();
    await new TelegramAlertWorker(queue, sender, env.telegram.chatId!).runOnce();
    expect(sender.sendText).toHaveBeenCalledTimes(1);
    expect(queue.finish).toHaveBeenCalledWith(batchId, "unknown", null, null);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNotificationEnv } from "../src/notification-env.js";

const { rpc, update } = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn() }));
vi.mock(import("../src/data-client.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  createWorkerClient: (() => ({
    rpc,
    from: () => ({ update: (values: unknown) => {
      update(values);
      const chain = { eq: () => chain, select: () => chain, single: async () => ({ data: { id: "x" }, error: null }) };
      return chain;
    } }),
  })) as never,
}));
const { runDevTelegramCertificationOnce } = await import("../src/dev-telegram-certification.js");

const csToken = "123:cs_bot";
const csChat = "-1001";
const source = {
  NOTIFICATION_WORKER_ID: "dev-cert-test", SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "s".repeat(48), WEB_PUSH_VAPID_SUBJECT: "mailto:ops@byus.kr",
  WEB_PUSH_VAPID_PUBLIC_KEY: "a".repeat(88), WEB_PUSH_VAPID_PRIVATE_KEY: "b".repeat(43),
  NOTIFICATION_EXTERNAL_ENVIRONMENT: "dev", BYUS_DATA_ENVIRONMENT: "development",
  TELEGRAM_BOT_TOKEN: "999:alert_bot", TELEGRAM_CHAT_ID: "-2002",
  TELEGRAM_CS_BOT_TOKEN: csToken, TELEGRAM_CS_CHAT_ID: csChat,
  TELEGRAM_DEV_CERTIFICATION_BOT_TOKEN: csToken, TELEGRAM_DEV_CERTIFICATION_CHAT_ID: csChat,
};
const card = {
  id: "fd3e78a8-2105-49b3-972b-c06ad358afe1", proof: false,
  submittedAt: "2026-11-26T05:00:00.000Z", nickname: "테***", photo: null, assistHint: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("DEV Telegram certification cards", () => {
  it("sends a DEV-marked card through the CS bot into the CS room", async () => {
    rpc.mockResolvedValue({ data: card, error: null });
    const api = vi.fn(async () => Response.json({ ok: true, result: { message_id: 77 } }));
    vi.stubGlobal("fetch", api);
    expect(await runDevTelegramCertificationOnce(parseNotificationEnv(source))).toBe(1);
    expect(rpc).toHaveBeenCalledWith("claim_dev_telegram_certification", { p_chat: csChat });
    const [url, init] = api.mock.calls[0] as unknown as [string, { body: FormData }];
    expect(url).toBe(`https://api.telegram.org/bot${csToken}/sendMessage`);
    expect(init.body.get("chat_id")).toBe(csChat);
    expect(String(init.body.get("text"))).toMatch(/^\[DEV 시험\] 덕후인증 심사 요청 · .* · 신청자 테\*\*\*\n/);
    expect(update).toHaveBeenCalledWith({ message_id: 77, has_photo: false });
  });

  it("refuses a polling bot or the activity alert room before claiming", async () => {
    for (const overrides of [
      { TELEGRAM_DEV_CERTIFICATION_BOT_TOKEN: "999:alert_bot" },
      { TELEGRAM_ALERT_BOT_TOKEN: csToken },
      { TELEGRAM_DEV_CERTIFICATION_CHAT_ID: "-2002" },
    ]) {
      await expect(runDevTelegramCertificationOnce(parseNotificationEnv({ ...source, ...overrides })))
        .rejects.toThrow("DEV_TELEGRAM_CERTIFICATION_CONFIG_INVALID");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stays off outside DEV", async () => {
    expect(await runDevTelegramCertificationOnce(parseNotificationEnv({ ...source, NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod" }))).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

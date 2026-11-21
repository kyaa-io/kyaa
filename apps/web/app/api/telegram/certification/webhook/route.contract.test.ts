import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({}) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc }) }));

const secret = "test_webhook_secret_32_characters";
const card = "fd3e78a8-2105-49b3-972b-c06ad358afe1";
const actor = "cd87323f-5926-414b-9175-af96a1efd421";
const api = vi.fn();

function callback({ header = secret, user = 42, chat = -123, action = "approve" } = {}) {
  return new Request("https://dev.kyaa.io/api/telegram/certification/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": header },
    body: JSON.stringify({
      callback_query: {
        id: "callback-123", from: { id: user, is_bot: false },
        message: { message_id: 13, chat: { id: chat } }, data: `${action}:${card}`,
      },
    }),
  });
}

beforeEach(() => {
  vi.stubEnv("BYUS_DATA_ENVIRONMENT", "development");
  vi.stubEnv("TELEGRAM_DEV_CERTIFICATION_BOT_TOKEN", "1:test_bot");
  vi.stubEnv("TELEGRAM_DEV_CERTIFICATION_CHAT_ID", "-123");
  vi.stubEnv("TELEGRAM_DEV_CERTIFICATION_WEBHOOK_SECRET", secret);
  vi.stubEnv("TELEGRAM_DEV_CERTIFICATION_ADMIN_MAP", JSON.stringify({ 42: actor }));
  vi.stubGlobal("fetch", api);
  api.mockImplementation(async () => Response.json({ ok: true }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("DEV Telegram certification webhook", () => {
  it("checks the secret, room and mapped actor before accessing the decision RPC", async () => {
    expect((await POST(callback({ header: "wrong" }))).status).toBe(403);
    expect((await POST(callback({ chat: -456 }))).status).toBe(204);
    expect((await POST(callback({ user: 43 }))).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("binds the mapped actor and message to the review and replaces the photo caption", async () => {
    rpc.mockResolvedValue({ data: { status: "approved", photo: true }, error: null });
    expect((await POST(callback())).status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("review_dev_telegram_certification", {
      p_card: card, p_chat: "-123", p_message: 13, p_actor: actor, p_telegram: 42, p_action: "approve",
    });
    expect(api.mock.calls[1][0]).toMatch(/\/editMessageCaption$/);
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({
      message_id: 13, caption: "승인했어요.", reply_markup: { inline_keyboard: [] },
    });
  });

  it("offers predefined reasons and checks for a concurrent decision before leaving the menu open", async () => {
    rpc.mockResolvedValue({ data: { status: "reasons", photo: false }, error: null });
    expect((await POST(callback({ action: "reasons" }))).status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[1][0]).toMatch(/\/editMessageReplyMarkup$/);
    const buttons = JSON.parse(api.mock.calls[1][1].body).reply_markup.inline_keyboard.flat();
    expect(buttons.map((button: { callback_data: string }) => button.callback_data.split(":")[0]))
      .toEqual(["unclear", "mismatch", "missing", "approve"]);
  });

  it("allows Telegram to retry an edit failure", async () => {
    rpc.mockResolvedValue({ data: { status: "rejected", photo: false }, error: null });
    api.mockImplementationOnce(async () => Response.json({ ok: true }))
      .mockImplementationOnce(async () => Response.json({ ok: false }, { status: 500 }));
    expect((await POST(callback({ action: "missing" }))).status).toBe(503);
  });
});

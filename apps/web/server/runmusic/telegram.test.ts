import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { encryptRunmusicContact } from "./contact-crypto";
import { processRunmusicTelegram, sendRunmusicTelegram } from "./telegram";

const id = "10000000-0000-4000-8000-000000000001", claimToken = "10000000-0000-4000-8000-000000000002";
const config = { token: "123:test-token", chatId: "-100123" };
const key = Buffer.alloc(32, 42);
const env = { RUNMUSIC_TELEGRAM_MODE: "enabled", RUNMUSIC_TELEGRAM_BOT_TOKEN: config.token, RUNMUSIC_TELEGRAM_CHAT_ID: config.chatId, RUNMUSIC_CONTACT_ENCRYPTION_KEY: key.toString("hex") };
const encrypted = encryptRunmusicContact("latest-id", id, key);
function setup() {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<unknown> => {
    if (name === "claim_runmusic_telegram_delivery") return { id, claimToken };
    if (name === "begin_runmusic_telegram_delivery") return { appUserId: id, email: "verified@example.com", ciphertext: encrypted.ciphertext, enteredAt: "2026-10-23T12:00:00Z" };
    return true;
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, result: { message_id: 123 } }));
  return { rpc, fetcher };
}
describe("Runmusic Telegram delivery", () => {
  it("does nothing while disabled and validates credentials before claiming", async () => {
    const { rpc, fetcher } = setup();
    expect(await processRunmusicTelegram(rpc, null, {}, fetcher)).toBe("disabled");
    await expect(processRunmusicTelegram(rpc, null, { ...env, RUNMUSIC_TELEGRAM_BOT_TOKEN: undefined }, fetcher)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only the begin snapshot, sends plain text, and records the provider receipt", async () => {
    const { rpc, fetcher } = setup();
    expect(await processRunmusicTelegram(rpc, id, env, fetcher)).toBe("handled");
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_runmusic_telegram_delivery", { p_app_user_id: id });
    expect(rpc).toHaveBeenNthCalledWith(2, "begin_runmusic_telegram_delivery", { p_delivery_id: id, p_claim_token: claimToken, p_chat_id: config.chatId });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.text).toContain("verified@example.com"); expect(body.text).toContain("latest-id");
    expect(body.text).toMatch(/21(?:시|:)/u); expect(body.text).toContain("(KST)"); expect(body.chat_id).toBe(config.chatId); expect(body.parse_mode).toBeUndefined();
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("latest-id");
    expect(rpc).toHaveBeenLastCalledWith("finish_runmusic_telegram_delivery", { p_delivery_id: id, p_claim_token: claimToken, p_outcome: "sent", p_message_id: 123, p_retry_after: null });
  });
  it.each(["claim_runmusic_telegram_delivery", "begin_runmusic_telegram_delivery"])("does not send when %s returns null", async stopped => {
    const { rpc, fetcher } = setup();
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name, args) => name === stopped ? Promise.resolve(null) : original(name, args));
    await processRunmusicTelegram(rpc, null, env, fetcher); expect(fetcher).not.toHaveBeenCalled();
  });
  it("marks corrupt contact failed before any HTTP request", async () => {
    const { rpc, fetcher } = setup();
    rpc.mockResolvedValueOnce({ id, claimToken }).mockResolvedValueOnce({ appUserId: id, email: "verified@example.com", ciphertext: "invalid", enteredAt: "2026-10-23T12:00:00Z" });
    await processRunmusicTelegram(rpc, null, env, fetcher); expect(fetcher).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("finish_runmusic_telegram_delivery", expect.objectContaining({ p_outcome: "invalid_contact" }));
  });
  it("records timeouts as unknown and never repeats HTTP when finish fails", async () => {
    const { rpc, fetcher } = setup(); fetcher.mockRejectedValue(new Error("timeout secret-url"));
    await processRunmusicTelegram(rpc, null, env, fetcher);
    expect(rpc).toHaveBeenLastCalledWith("finish_runmusic_telegram_delivery", expect.objectContaining({ p_outcome: "unknown" }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("secret-url");
    const next = setup(), original = next.rpc.getMockImplementation()!;
    next.rpc.mockImplementation((name, args) => name.startsWith("finish_") ? Promise.reject(new Error("database unavailable")) : original(name, args));
    await expect(processRunmusicTelegram(next.rpc, null, env, next.fetcher)).rejects.toThrow("database unavailable");
    expect(next.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [429, { ok: false, error_code: 429, parameters: { retry_after: 20 } }, { outcome: "throttled", retryAfter: 20 }],
    [429, { ok: false, parameters: { retry_after: 999999 } }, { outcome: "throttled", retryAfter: 86400 }],
    [400, { ok: false }, { outcome: "rejected" }], [401, {}, { outcome: "rejected" }], [403, {}, { outcome: "rejected" }],
    [500, {}, { outcome: "unknown" }], [200, { ok: true, result: { message_id: 0 } }, { outcome: "unknown" }],
    [500, { ok: false, error_code: 429 }, { outcome: "unknown" }],
    [200, { ok: true, result: { message_id: 12 }, error_code: 429 }, { outcome: "unknown" }],
    [429, { ok: true, result: { message_id: 12 } }, { outcome: "unknown" }],
    [200, { error_code: 429 }, { outcome: "unknown" }],
    [200, { ok: false, error_code: 429 }, { outcome: "throttled", retryAfter: 60 }],
    [200, { ok: false }, { outcome: "unknown" }],
  ])("classifies HTTP %s without replaying ambiguous sends", async (status, body, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status: status as number }));
    expect(await sendRunmusicTelegram(config, "test", fetcher)).toEqual(expected); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("treats malformed success as unknown", async () => {
    expect(await sendRunmusicTelegram(config, "test", vi.fn<typeof fetch>().mockResolvedValue(new Response("bad json")))).toEqual({ outcome: "unknown" });
  });
});

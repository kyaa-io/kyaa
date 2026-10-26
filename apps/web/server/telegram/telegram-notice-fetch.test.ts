import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", async importOriginal => {
  const actual = await importOriginal<typeof import("node:https")>();
  return { ...actual, request: state.request, default: { ...actual, request: state.request } };
});
import { telegramNoticeFetch } from "./telegram-notice-fetch";
const url = "https://api.telegram.org/bottest/sendMessage";
let outgoing: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
let incoming: EventEmitter & { statusCode: number };
beforeEach(() => {
  outgoing = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn((error: Error) => outgoing.emit("error", error)) });
  incoming = Object.assign(new EventEmitter(), { statusCode: 200 });
  state.request.mockReset().mockImplementation((_url, _options, receive) => { queueMicrotask(() => receive(incoming)); return outgoing; });
});
describe("Telegram IPv4 transport", () => {
  it("sends the exact JSON once over IPv4 and keeps the abort deadline", async () => {
    const signal = AbortSignal.timeout(1000), body = JSON.stringify({ text: "응모 완료" });
    const pending = telegramNoticeFetch(url, { method: "POST", body, signal });
    await Promise.resolve();
    incoming.emit("data", Buffer.from('{"ok":true}')); incoming.emit("end");
    expect(await (await pending).json()).toEqual({ ok: true });
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(state.request.mock.calls[0][1]).toMatchObject({ family: 4, signal, headers: { "content-length": Buffer.byteLength(body) } });
    expect(outgoing.end).toHaveBeenCalledExactlyOnceWith(body);
  });
  it("does not retry a connection failure", async () => {
    const pending = telegramNoticeFetch(url, { method: "POST", body: "{}" });
    outgoing.emit("error", new Error("ETIMEDOUT"));
    await expect(pending).rejects.toThrow("ETIMEDOUT");
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it("bounds Telegram responses and preserves redirect responses without following them", async () => {
    const pending = telegramNoticeFetch(url, { method: "POST", body: "{}" });
    await Promise.resolve(); incoming.emit("data", Buffer.alloc(1_048_577));
    await expect(pending).rejects.toThrow("TELEGRAM_RESPONSE_TOO_LARGE");
    expect(state.request).toHaveBeenCalledTimes(1);
    const redirect = telegramNoticeFetch(url, { method: "POST", body: "{}" });
    await Promise.resolve(); incoming.statusCode = 302; incoming.emit("end");
    expect((await redirect).status).toBe(302);
    expect(state.request).toHaveBeenCalledTimes(2);
  });
  it("rejects an unexpected bodyless HTTP status without crashing or retrying", async () => {
    const pending = telegramNoticeFetch(url, { method: "POST", body: "{}" });
    await Promise.resolve(); incoming.statusCode = 204;
    expect(() => incoming.emit("end")).not.toThrow();
    await expect(pending).rejects.toThrow();
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it("leaves GitHub verification on the existing fetch path", async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 1 })); vi.stubGlobal("fetch", fetcher);
    await telegramNoticeFetch("https://api.github.com/repos/kyaa-io/kyaa", { cache: "no-store" });
    expect(fetcher).toHaveBeenCalledOnce(); expect(state.request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

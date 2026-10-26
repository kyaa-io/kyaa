import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createDisplayTranslationHandler, type DisplayTranslationDependencies } from "./display-route";

const owner = "2b8fd044-643e-46e2-83e0-090f50bab563";
const cached = { translatedText: JSON.stringify(["Привет"]), cached: true };
afterEach(() => vi.unstubAllEnvs());
function dependencies() {
  return { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn().mockResolvedValue(cached),
    translate: vi.fn().mockResolvedValue([{ translatedText: "Привет" }]), secret: "local-display-translation-secret", appOrigin: "https://kyaa.test",
    aws: true, vercel: false, localDevelopment: false, now: () => new Date("2026-10-26T00:00:00Z"),
  } satisfies DisplayTranslationDependencies;
}
function request(body: unknown = { text: "Hello", targetLocale: "ru" }, headers: Record<string, string> = {}) {
  return new Request("https://kyaa.test/api/display-translations", { method: "POST", headers: {
    origin: "https://kyaa.test", "content-type": "application/json", "x-byus-client-ip": "192.0.2.1", ...headers,
  }, body: JSON.stringify(body) });
}
describe("bounded display translation", () => {
  it("accepts supported aliases only when Origin matches the actual trusted request host", async () => {
    const d = dependencies(); d.appOrigin = "https://kyaa.io";
    const aliasRequest = (url: string, origin: string, headers: Record<string, string> = {}) => new Request(url, {
      method: "POST", headers: { origin, "content-type": "application/json", "x-byus-client-ip": "192.0.2.1", ...headers },
      body: JSON.stringify({ text: "Hello", targetLocale: "ru" }),
    });
    const handle = createDisplayTranslationHandler(d);
    expect((await handle(aliasRequest("https://www.kyaa.io/api/display-translations", "https://www.kyaa.io"))).status).toBe(200);
    expect((await handle(aliasRequest("https://byus.kr/api/display-translations", "https://byus.kr"))).status).toBe(200);
    expect((await handle(aliasRequest("https://www.kyaa.io/api/display-translations", "https://kyaa.io"))).status).toBe(400);
    expect((await handle(aliasRequest("https://evil.test/api/display-translations", "https://evil.test"))).status).toBe(400);
    vi.stubEnv("HOSTING_PROVIDER", "aws");
    expect((await handle(aliasRequest("http://web:3000/api/display-translations", "https://www.kyaa.io", { "x-forwarded-proto": "https", "x-forwarded-host": "www.kyaa.io" }))).status).toBe(200);
    expect((await handle(aliasRequest("http://web:3000/api/display-translations", "https://evil.test", { "x-forwarded-proto": "https", "x-forwarded-host": "evil.test" }))).status).toBe(400);
  });
  it("serves a guest cache hit without provider/quota calls and never forwards source text to the database", async () => {
    const d = dependencies(); const res = await createDisplayTranslationHandler(d)(request());
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ translatedText: "Привет", cached: true });
    expect(d.authorize).not.toHaveBeenCalled(); expect(d.translate).not.toHaveBeenCalled();
    expect(d.rpc).toHaveBeenCalledOnce(); expect(d.rpc.mock.calls[0][1]).toMatchObject({ p_app_user_id: null, p_target_locale: "ru", p_source_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(d.rpc.mock.calls)).not.toContain("Hello");
  });
  it("does not downgrade invalid supplied credentials to guest", async () => {
    const d = dependencies(); d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
    expect((await createDisplayTranslationHandler(d)(request(undefined, { authorization: "Bearer invalid" }))).status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled(); expect(d.translate).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://other.test" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" }])("rejects cross-site/non-JSON requests before provider access", async headers => {
    const d = dependencies(); expect((await createDisplayTranslationHandler(d)(request(undefined, headers))).status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled(); expect(d.translate).not.toHaveBeenCalled();
  });
  it.each([{ text: "secret", targetLocale: "ru", appUserId: owner }, { texts: [], targetLocale: "ru" }, { text: " ", targetLocale: "ru" }, { text: "x".repeat(20_001), targetLocale: "ru" }])("rejects invalid payloads without quota or provider calls", async body => {
    const d = dependencies(); expect((await createDisplayTranslationHandler(d)(request(body))).status).toBe(400); expect(d.rpc).not.toHaveBeenCalled();
  });
  it("bounds streamed body bytes and fails closed without the trusted edge IP", async () => {
    const d = dependencies(); expect((await createDisplayTranslationHandler(d)(request({ text: "x".repeat(96_001), targetLocale: "ru" }))).status).toBe(413);
    expect((await createDisplayTranslationHandler(d)(request(undefined, { "x-byus-client-ip": "", "x-forwarded-for": "192.0.2.1" }))).status).toBe(503);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("ignores spoofed XFF, rotates anonymous identity daily and isolates authenticated owners", async () => {
    const d = dependencies(), handler = createDisplayTranslationHandler(d);
    await handler(request(undefined, { "x-forwarded-for": "203.0.113.1" }));
    const guest = d.rpc.mock.calls.at(-1)![1].p_requester_hash;
    await handler(request(undefined, { "x-forwarded-for": "203.0.113.2" })); expect(d.rpc.mock.calls.at(-1)![1].p_requester_hash).toBe(guest);
    await handler(request(undefined, { authorization: "Bearer valid" })); const user = d.rpc.mock.calls.at(-1)![1].p_requester_hash; expect(user).not.toBe(guest);
    d.authorize.mockResolvedValue({ appUserId: "45ea47a7-7604-47b2-bec8-f4f3674c706c" });
    await handler(request(undefined, { authorization: "Bearer another" })); expect(d.rpc.mock.calls.at(-1)![1].p_requester_hash).not.toBe(user);
    d.now = () => new Date("2026-10-27T00:00:00Z"); await handler(request()); expect(d.rpc.mock.calls.at(-1)![1].p_requester_hash).not.toBe(guest);
  });
  it("reserves a whole ordered text batch once before translating and preserves slot order", async () => {
    const d = dependencies(); const batch = ["Hello", "Goodbye"];
    d.translate.mockResolvedValue([{ translatedText: "Привет" }, { translatedText: "До свидания" }]);
    d.rpc.mockImplementation(async name => name === "read_display_translation" ? (d.rpc.mock.calls.length === 1 ? null : { translatedText: JSON.stringify(["Привет", "До свидания"]), cached: true }) : null);
    const res = await createDisplayTranslationHandler(d)(request({ texts: batch, targetLocale: "ru" }));
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ translatedTexts: ["Привет", "До свидания"], cached: false });
    expect(d.rpc.mock.calls.map(call => call[0])).toEqual(["read_display_translation", "reserve_display_translation_request", "save_display_translation", "read_display_translation"]);
    expect(d.rpc.mock.calls[1][1]).toMatchObject({ p_character_count: 12 }); expect(d.translate).toHaveBeenCalledWith(batch, "ru");
  });
  it("returns only fixed errors when quota/provider fails", async () => {
    const d = dependencies(); d.rpc.mockImplementation(async name => { if(name === "reserve_display_translation_request") throw new Error("TRANSLATION_RATE_LIMITED"); return null; });
    const res = await createDisplayTranslationHandler(d)(request()); expect(res.status).toBe(429); expect(d.translate).not.toHaveBeenCalled();
    d.rpc.mockResolvedValue(null); d.translate.mockRejectedValue(new Error("secret original text"));
    const failed = await createDisplayTranslationHandler(d)(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret");
  });
});

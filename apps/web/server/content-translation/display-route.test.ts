import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createDisplayTranslationHandler, sourceHash, TRANSLATOR_VERSION, type DisplayTranslationDependencies } from "./display-route";

const owner = "2b8fd044-643e-46e2-83e0-090f50bab563";
afterEach(() => vi.unstubAllEnvs());
/** In-memory stand-in for the shared cache table: first stored value wins, keyed by hash + locale + translator version. */
function fakeRpc() {
  const rows = new Map<string, { sourceHash: string; translatedText: string; detectedSourceLocale: string | null }>();
  return vi.fn(async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (name === "read_shared_translations") return (args.p_source_hashes as string[]).flatMap(h => rows.get(`${h}|${args.p_target_locale}|${args.p_translator_version}`) ?? []);
    if (name === "save_shared_translations") { for (const item of args.p_items as typeof rows extends Map<string, infer V> ? V[] : never) { const k = `${item.sourceHash}|${args.p_target_locale}|${args.p_translator_version}`; if (!rows.has(k)) rows.set(k, item); } return null; }
    return null;
  });
}
function dependencies() {
  return { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: fakeRpc(),
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
  it("translates the same text once across two requests and never sends source text to the database", async () => {
    const d = dependencies(); const handle = createDisplayTranslationHandler(d);
    const first = await handle(request()); expect(await first.json()).toEqual({ translatedText: "Привет", cached: false });
    const second = await handle(request(undefined, { "x-byus-client-ip": "192.0.2.77" }));
    expect(await second.json()).toEqual({ translatedText: "Привет", cached: true });
    expect(d.translate).toHaveBeenCalledTimes(1);
    expect(d.rpc.mock.calls.filter(c => c[0] === "reserve_display_translation_request")).toHaveLength(1);
    expect(JSON.stringify(d.rpc.mock.calls.filter(c => c[0] === "read_shared_translations"))).not.toContain("Hello");
    expect(d.rpc.mock.calls[0][1]).toMatchObject({ p_target_locale: "ru", p_source_hashes: [expect.stringMatching(/^[a-f0-9]{64}$/)] });
  });
  it("retranslates edited text and treats whitespace/line-ending differences as the same text", async () => {
    const d = dependencies(); const handle = createDisplayTranslationHandler(d);
    await handle(request({ text: "Hello", targetLocale: "ru" })); await handle(request({ text: "  Hello \r\n", targetLocale: "ru" }));
    expect(d.translate).toHaveBeenCalledTimes(1);
    await handle(request({ text: "Hello there", targetLocale: "ru" })); expect(d.translate).toHaveBeenCalledTimes(2);
    await handle(request({ text: "Hello", targetLocale: "en" })); expect(sourceHash("Hello")).toBe(sourceHash(" Hello\n"));
    expect(d.rpc.mock.calls.find(c => c[0] === "save_shared_translations")![1]).toMatchObject({ p_translator_version: TRANSLATOR_VERSION });
  });
  it("skips the provider for same-language, emoji, number, URL and very short text", async () => {
    const d = dependencies(); const handle = createDisplayTranslationHandler(d);
    const skipped = ["안녕하세요 반가워요", "😀🎉", "12345", "https://example.com/a", "a", "o👍"];
    const res = await handle(request({ texts: skipped, targetLocale: "ko" }));
    expect(await res.json()).toEqual({ translatedTexts: skipped, cached: true });
    expect(d.translate).not.toHaveBeenCalled(); expect(d.rpc).not.toHaveBeenCalled();
  });
  it("remembers text the provider detects as already in the target language and keeps the original", async () => {
    const d = dependencies(); d.translate.mockResolvedValue([{ translatedText: "Hola amigos", detectedSourceLocale: "ru" }]);
    const handle = createDisplayTranslationHandler(d);
    expect(await (await handle(request({ text: "Hello", targetLocale: "ru" }))).json()).toEqual({ translatedText: "Hello", cached: false });
    expect(await (await handle(request({ text: "Hello", targetLocale: "ru" }))).json()).toEqual({ translatedText: "Hello", cached: true });
    expect(d.translate).toHaveBeenCalledTimes(1);
  });
  it("sends only the uncached texts of a page in one provider request and keeps order", async () => {
    const d = dependencies(); const handle = createDisplayTranslationHandler(d);
    d.translate.mockResolvedValueOnce([{ translatedText: "Привет" }]); await handle(request({ text: "Hello", targetLocale: "ru" }));
    d.translate.mockResolvedValueOnce([{ translatedText: "До свидания" }]);
    const res = await handle(request({ texts: ["Hello", "😀", "Goodbye", "Goodbye"], targetLocale: "ru" }));
    expect(await res.json()).toEqual({ translatedTexts: ["Привет", "😀", "До свидания", "До свидания"], cached: false });
    expect(d.translate).toHaveBeenLastCalledWith(["Goodbye"], "ru"); expect(d.translate).toHaveBeenCalledTimes(2);
    expect(d.rpc.mock.calls.filter(c => c[0] === "reserve_display_translation_request").at(-1)![1]).toMatchObject({ p_character_count: 7 });
  });
  it("derives the quota identity from the trusted edge IP, rotates it daily and isolates owners", async () => {
    const d = dependencies(), handler = createDisplayTranslationHandler(d);
    const hash = () => d.rpc.mock.calls.filter(c => c[0] === "reserve_display_translation_request").at(-1)![1].p_requester_hash;
    await handler(request({ text: "One", targetLocale: "ru" }, { "x-forwarded-for": "203.0.113.1" })); const guest = hash();
    await handler(request({ text: "Two", targetLocale: "ru" }, { "x-forwarded-for": "203.0.113.2" })); expect(hash()).toBe(guest);
    await handler(request({ text: "Three", targetLocale: "ru" }, { authorization: "Bearer valid" })); const user = hash(); expect(user).not.toBe(guest);
    d.authorize.mockResolvedValue({ appUserId: "45ea47a7-7604-47b2-bec8-f4f3674c706c" });
    await handler(request({ text: "Four", targetLocale: "ru" }, { authorization: "Bearer another" })); expect(hash()).not.toBe(user);
    d.now = () => new Date("2026-10-27T00:00:00Z"); await handler(request({ text: "Five", targetLocale: "ru" })); expect(hash()).not.toBe(guest);
  });
  it("falls back to the original text on quota/provider/storage failure and does not cache the failure", async () => {
    const d = dependencies(); const handle = createDisplayTranslationHandler(d);
    d.translate.mockRejectedValueOnce(new Error("secret original text"));
    const failed = await handle(request()); expect(failed.status).toBe(200);
    const body = await failed.text(); expect(JSON.parse(body)).toEqual({ translatedText: "Hello", cached: false, fallback: true }); expect(body).not.toContain("secret");
    expect(await (await handle(request())).json()).toEqual({ translatedText: "Привет", cached: false });
    const base = d.rpc.getMockImplementation()!;
    d.rpc.mockImplementation(async (name, args) => { if (name === "reserve_display_translation_request") throw new Error("TRANSLATION_RATE_LIMITED"); return base(name, args); });
    const limited = await handle(request({ text: "Another", targetLocale: "ru" })); expect(await limited.json()).toMatchObject({ translatedText: "Another", fallback: true });
    d.rpc.mockImplementation(async () => { throw new Error("db down"); });
    expect(await (await handle(request({ text: "Third", targetLocale: "ru" }))).json()).toMatchObject({ translatedText: "Third", fallback: true });
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
});

it("blocks a response when the account is deactivated during provider latency", async () => {
 const d = dependencies();
 const original = d.rpc.getMockImplementation()!;
 d.rpc.mockImplementation(async (name, args) => {
  if (name === "read_display_translation") throw new Error("FAN_WEB_ACTIVE_ACCOUNT_REQUIRED");
  return original(name, args);
 });
 const res = await createDisplayTranslationHandler(d)(request({ text: "Hello world", targetLocale: "ru" }, { authorization: "Bearer valid" }));
 expect(res.status).toBe(503);
});
it("does not call the provider when another request owns the miss", async () => {
 const d = dependencies(); const original = d.rpc.getMockImplementation()!;
 d.rpc.mockImplementation(async (name, args) => name === "claim_shared_translation_requests" ? false : original(name, args));
 await createDisplayTranslationHandler(d)(request({ text: "Hello world", targetLocale: "ru" }));
 expect(d.translate).not.toHaveBeenCalled();
});

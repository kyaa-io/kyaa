import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createApnsProvider, createFcmProvider, mobilePushGenericCopy } from "./push-providers";

const payload = { type: "notification_available" as const, notificationId: "11111111-1111-4111-8111-111111111111", category: "benefit" };
function privatePem(type: "ec" | "rsa") {
  const pair = type === "ec" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}
describe("native push providers", () => {
  it("uses an APNs alert with generic localized copy", async () => {
    let origin = "", headers: Record<string, unknown> = {}, body = "";
    class Stream extends EventEmitter { setEncoding() {} setTimeout() { return this; } close() { this.emit("close"); } end(value: string) { body = value; queueMicrotask(() => { this.emit("response", { ":status": 200 }); this.emit("close"); }); } }
    class Client extends EventEmitter { request(value: Record<string, unknown>) { headers = value; return new Stream(); } close() {} }
    const provider = createApnsProvider({ environment: "sandbox", keyId: "ABCDEFGHIJ", teamId: "KLMNOPQRST", bundleId: "kr.byus.app", privateKey: privatePem("ec"), connect: ((value: string) => { origin = value; return new Client(); }) as never });
    await provider.send({ platform: "ios", pushToken: "a".repeat(64), locale: "ko", payload });
    expect(origin).toBe("https://api.sandbox.push.apple.com"); expect(headers["apns-topic"]).toBe("kr.byus.app"); expect(headers["apns-push-type"]).toBe("alert"); expect(headers["apns-priority"]).toBe("10");
    expect(JSON.parse(body)).toEqual({ aps: { alert: { title: "새 알림이 있어요", body: "앱에서 확인해 주세요." }, sound: "default", "content-available": 1 }, type: payload.type, notificationId: payload.notificationId, category: "benefit" });
  });
  it("uses FCM v1 with generic localized notification and routing data", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return calls.length === 1 ? Response.json({ access_token: "access", expires_in: 3600 }) : Response.json({ name: "projects/byus-prod/messages/1" }); });
    const provider = createFcmProvider({ projectId: "byus-prod", clientEmail: "push@byus-prod.iam.gserviceaccount.com", privateKey: privatePem("rsa") }, fetcher as typeof fetch);
    await provider.send({ platform: "android", pushToken: "android-token", locale: "fr", payload });
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token"); expect(String(calls[0].init.body)).toContain("jwt-bearer"); expect(calls[1].url).toBe("https://fcm.googleapis.com/v1/projects/byus-prod/messages:send");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ message: { token: "android-token", notification: { title: "Vous avez une nouvelle notification", body: "Ouvrez l’application pour la consulter." }, data: { type: payload.type, notificationId: payload.notificationId, category: "benefit" }, android: { priority: "high", notification: { sound: "default" } } } });
  });
  it("defines generic copy for every supported locale", () => {
    for (const locale of ["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr"] as const) expect(mobilePushGenericCopy(locale)).toEqual({ title: expect.any(String), body: expect.any(String) });
  });
  it("classifies provider invalid-token responses for durable installation invalidation", async () => {
    const fetcher = vi.fn(async () => fetcher.mock.calls.length === 1 ? Response.json({ access_token: "access", expires_in: 3600 }) : Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }));
    const provider = createFcmProvider({ projectId: "byus-prod", clientEmail: "push@byus-prod.iam.gserviceaccount.com", privateKey: privatePem("rsa") }, fetcher as typeof fetch);
    await expect(provider.send({ platform: "android", pushToken: "android-token", locale: "en", payload })).rejects.toMatchObject({ code: "INVALID_TOKEN", invalidToken: true, retryable: false });
  });
});

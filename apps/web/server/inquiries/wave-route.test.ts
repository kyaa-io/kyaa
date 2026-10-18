import { createHmac } from "node:crypto";
import { expect, it, vi } from "vitest";
import { InquiryError } from "./fanmeeting-route";
import { createWaveHandler, waveOptions } from "./wave-route";
const body = { name: "Name", email: "person@example.com", message: "Hello", interest: "creator", locale: "ko", website: "", requestId: "11111111-1111-4111-8111-111111111111", consent: true, sessionId: "22222222-2222-4222-8222-222222222222", channel: "google" };
function request(payload: unknown = body, origin = "https://kyaawave.com") {
  return new Request("https://kyaa.io/api/inquiries/wave", { method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "cross-site", "x-vercel-forwarded-for": "203.0.113.7" }, body: JSON.stringify(payload) });
}
function setup(engagement = false) {
  const repository = { submit: vi.fn().mockResolvedValue(false), engage: vi.fn().mockResolvedValue(false) };
  return { repository, handle: createWaveHandler({ repository, secret: "secret", vercel: true }, engagement) };
}
it("accepts both exact cross-site origins, hashes attribution and preserves shared IP quota identity", async () => {
  const { handle, repository } = setup();
  const response = await handle(request());
  expect(response.status).toBe(202); expect(await response.json()).toEqual({ status: "accepted" });
  expect(response.headers.get("access-control-allow-origin")).toBe("https://kyaawave.com");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(response.headers.get("vary")).toBe("Origin"); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(repository.submit.mock.calls[0]?.[1]).toBe(createHmac("sha256", "secret").update("byus-inquiry-v1:ip:203.0.113.7").digest("hex"));
  expect(repository.submit.mock.calls[0]?.[3]).toMatch(/^[a-f0-9]{64}$/);
  repository.submit.mockResolvedValue(true);
  expect((await handle(request(body, "https://www.kyaawave.com"))).status).toBe(200);
});
it.each(["https://kyaawave.com.evil.test", "https://kyaa.io", "null", ""])("rejects disallowed origin %s", async origin => {
  const { handle, repository } = setup(); const response = await handle(request(body, origin));
  expect(response.status).toBe(400); expect(response.headers.get("access-control-allow-origin")).toBeNull(); expect(repository.submit).not.toHaveBeenCalled();
});
it.each([{ consent: false }, { website: "spam" }, { company: "kyaa wave" }, { sessionId: "bad" }, { channel: "https://secret.test" }, { locale: "ja" }, { interest: "partner" }, { name: "x".repeat(81) }, { email: "x\ny@example.com" }, { message: "x".repeat(4001) }])("strictly rejects invalid inquiry %j", async patch => {
  const { handle, repository } = setup(); expect((await handle(request({ ...body, ...patch }))).status).toBe(400); expect(repository.submit).not.toHaveBeenCalled();
});
it("bounds streamed bytes even without Content-Length and rejects malformed JSON", async () => {
  const { handle, repository } = setup();
  const base = request();
  expect((await handle(new Request(base.url, { method: "POST", headers: base.headers, body: '"' + "x".repeat(16384) + '"' }))).status).toBe(400);
  expect((await handle(new Request(base.url, { method: "POST", headers: base.headers, body: "{" }))).status).toBe(400);
  expect(repository.submit).not.toHaveBeenCalled();
});
it.each([["INQUIRY_RATE_LIMITED",429],["INQUIRY_IDEMPOTENCY_CONFLICT",409],["INQUIRY_UNAVAILABLE",503]] as const)("maps %s with CORS for safe retry", async (code, status) => {
  const { handle, repository } = setup(); repository.submit.mockRejectedValue(new InquiryError(code));
  const response = await handle(request()); expect(response.status).toBe(status); expect(response.headers.get("access-control-allow-origin")).toBe("https://kyaawave.com");
});
it("masks unknown commit failures and never falls back to caller IP headers", async () => {
  const { handle, repository } = setup(); repository.submit.mockRejectedValue(new Error("secret SQL"));
  expect(await (await handle(request())).text()).not.toContain("secret SQL");
  const req = request(); req.headers.delete("x-vercel-forwarded-for"); req.headers.set("x-forwarded-for", "203.0.113.9");
  expect((await handle(req)).status).toBe(503);
});
it("permits only Content-Type preflight for POST", () => {
  const options = (extra: Record<string,string> = {}) => new Request("https://kyaa.io/api/inquiries/wave", { method: "OPTIONS", headers: { origin: "https://kyaawave.com", "access-control-request-method": "POST", "access-control-request-headers": "content-type", ...extra } });
  expect(waveOptions(options()).status).toBe(204);
  expect(waveOptions(options({ "access-control-request-headers": "content-type,authorization" })).status).toBe(400);
  expect(waveOptions(options({ "access-control-request-method": "GET" })).status).toBe(400);
});
const engagement = { event: "page_view", requestId: body.requestId, sessionId: body.sessionId, channel: "direct", locale: "en" };
it.each(["page_view","inquiry_open","inquiry_submit"])("accepts client stage %s", async event => {
  const { handle, repository } = setup(true); expect((await handle(request({ ...engagement,event }))).status).toBe(202); expect(repository.engage).toHaveBeenCalledOnce(); expect(repository.submit).not.toHaveBeenCalled();
});
it.each([{ event: "inquiry_accepted" }, { email: body.email }, { url: "https://example.com" }, { channel: "x".repeat(2100) }])("rejects forged acceptance and arbitrary analytics data %j", async patch => {
  const { handle, repository } = setup(true); expect((await handle(request({ ...engagement,...patch }))).status).toBe(400); expect(repository.engage).not.toHaveBeenCalled();
});

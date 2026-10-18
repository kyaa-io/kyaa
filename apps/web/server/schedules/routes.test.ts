import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createParticipationHandler } from "./routes";
const owner = "10000000-0000-4000-8000-000000000001", id = "20000000-0000-4000-8000-000000000002";
const rpc = vi.fn(), authorize = vi.fn(async (value: string | null) => { if (value !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED",401,"invalid"); return { appUserId: owner }; });
const authorizeAdmin = vi.fn(async (_authorization: string | null, _correlationId: string) => ({ appUserId: owner, allowlistId: id, role: "operator" as "operator" | "viewer", email: "admin@example.test" }));
const run = createParticipationHandler({ rpc, authorize, authorizeAdmin });
const request = (path: string, body?: unknown, authenticated = false, method = body === undefined ? "GET" : "POST") => new Request(`https://byus.example${path}`, { method, headers: { ...(authenticated ? { authorization: "Bearer valid" } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(() => { rpc.mockReset(); authorize.mockClear(); authorizeAdmin.mockClear(); });
it("rejects supplied invalid sessions on public reads rather than downgrading", async () => {
  const result = await run("schedules", new Request("https://byus.example/api/schedules?month=2026-09", { headers: { authorization: "Bearer invalid" } }));
  expect(result.status).toBe(401); expect(rpc).not.toHaveBeenCalled();
});
it("takes subscription owner only from auth and rejects extra input fields", async () => {
  expect((await run("subscription", request("/api", { subscribed: true, appUserId: id }, true, "PUT"), { id })).status).toBe(422);
  expect(rpc).not.toHaveBeenCalled(); rpc.mockResolvedValue({ scheduleId: id, subscribed: true });
  const result = await run("subscription", request("/api", { subscribed: true }, true, "PUT"), { id });
  expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(rpc).toHaveBeenCalledWith("fan_web_set_schedule_subscription", { p_app_user_id: owner, p_schedule_id: id, p_subscribed: true });
});
it("encodes ordered pagination and preserves month/artist bounds", async () => {
  rpc.mockResolvedValue({ items: [], nextCursor: { at: "2026-09-01T00:00:00Z", id } });
  const result = await run("schedules", request("/api?month=2026-09&celebritySlug=artist-one"));
  expect(result.status).toBe(200); const data = await result.json(); expect(JSON.parse(Buffer.from(data.nextCursor, "base64url").toString())).toEqual({ at: "2026-09-01T00:00:00Z", id });
  expect(rpc).toHaveBeenLastCalledWith("fan_web_list_schedules", expect.objectContaining({ p_app_user_id: null, p_celebrity_slug: "artist-one", p_limit: 100, p_starts_at: "2026-08-31T15:00:00.000Z" }));
});
it("keeps viewer writes out of RPC and uses one correlated server actor for mutations", async () => {
  authorizeAdmin.mockResolvedValueOnce({ appUserId: owner, allowlistId: id, role: "viewer", email: "admin@example.test" });
  expect((await run("admin-live-settings", request("/api", {}, true, "PUT"), { id })).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ accepting: false, closesAt: null, visibility: "public", revision: 1 });
  expect((await run("admin-live-settings", request("/api", { expectedRevision: 0, accepting: false, closesAt: null, visibility: "public" }, true, "PUT"), { id })).status).toBe(200);
  expect(rpc.mock.calls[0][1].p_correlation_id).toBe(authorizeAdmin.mock.calls[1]?.[1]);
});
it("returns stable deadline errors and hides RPC details", async () => {
  rpc.mockRejectedValueOnce(new Error("db: FAN_WEB_CLOSED secret"));
  const result = await run("live-submissions", request("/api", { kind: "question", body: "Hello", idempotencyKey: id }, true), { slug: "event" });
  expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: { code: "FAN_WEB_CLOSED" } });
  rpc.mockRejectedValueOnce(new Error("database password"));
  const fail = await run("schedule", request("/api"), { id }); expect(fail.status).toBe(503); expect(await fail.text()).not.toContain("password");
});
it("rejects oversized JSON before writes and invalid opaque cursors", async () => {
  expect((await run("requests", request("/api", { note: "a".repeat(17000) }, true))).status).toBe(413);
  expect((await run("suggestions", request("/api?cursor=%%", undefined, true))).status).toBe(422); expect(rpc).not.toHaveBeenCalled();
});
it("treats malformed server projections as unavailable without leaking internal fields", async () => {
  rpc.mockResolvedValueOnce({ items: [], nextCursor: null, appUserId: owner });
  const result = await run("suggestions", request("/api", undefined, true));
  expect(result.status).toBe(503); expect(await result.text()).not.toContain(owner);
});
it("publishes canonical time-zone and reviewed-place capabilities while honestly disabling an absent import provider", async () => {
  const result = await run("suggestion-options", request("/api?locale=en"));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(expect.objectContaining({ defaultTimeZone: "UTC", timeZoneChangeRequiresConfirmation: true,
    officialImport: { available: false }, placeSearch: { available: true, provider: "byus_reviewed_schedules" }, timeZones: expect.arrayContaining(["UTC", "Asia/Seoul"]) }));
  expect(authorize).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it("keeps import authenticated and searches only the reviewed-place RPC", async () => {
  expect((await run("suggestion-import", request("/api", { sourceUrl: "https://example.test/event", locale: "ko" }))).status).toBe(401);
  const imported = await run("suggestion-import", request("/api", { sourceUrl: "https://example.test/event", locale: "ko" }, true));
  expect(imported.status).toBe(503); expect(await imported.json()).toEqual({ error: { code: "FAN_WEB_OFFICIAL_IMPORT_UNAVAILABLE" } });
  rpc.mockResolvedValueOnce({ places: [{ name: "KSPO Dome" }] });
  const place = await run("place-search", request("/api", { query: "KSPO Dome", locale: "en" }, true));
  expect(place.status).toBe(200); expect(await place.json()).toEqual({ places: [{ name: "KSPO Dome" }] });
  expect(rpc).toHaveBeenCalledWith("fan_web_search_schedule_places", { p_query: "KSPO Dome", p_locale: "en", p_limit: 20 });
});
it("returns only fields verified by the official metadata provider", async () => {
  const importOfficial = vi.fn(async () => ({ title: "NCHIVE fan signing", startsAt: "2026-10-24T05:00:00.000Z", location: "NCHIVE Hall", officialSourceUrl: "https://example.test/event" }));
  const withImport = createParticipationHandler({ rpc, authorize, authorizeAdmin, importOfficialSchedule: importOfficial });
  const result = await withImport("suggestion-import", request("/api", { sourceUrl: "https://example.test/event", locale: "ko" }, true));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ title: "NCHIVE fan signing", startsAt: "2026-10-24T05:00:00.000Z", location: "NCHIVE Hall", officialSourceUrl: "https://example.test/event" });
  expect(importOfficial).toHaveBeenCalledWith("https://example.test/event");
});
it("converts native local schedule times, preserves online state, and rejects DST ambiguity", async () => {
  const item = { id, celebritySlug: "artist-one", title: "Stream", kind: "event", startsAt: "2026-09-30T16:00:00.000Z", endsAt: null,
    timeZone: "Asia/Seoul", isOnline: true, location: "", participationInstructions: "", description: "", sourceUrl: null, locale: "ko", status: "pending",
    revision: 1, reviewReason: null, reviewedAt: null, scheduleId: null, scheduleHref: null, createdAt: "2026-09-01T00:00:00Z" };
  rpc.mockResolvedValue({ item, replayed: false });
  const body = { celebritySlug: "artist-one", title: "Stream", kind: "event", startsAtLocal: "2026-10-01T01:00", endsAtLocal: null,
    timeZone: "ROK", isOnline: true, location: "", participationInstructions: "", description: "", sourceUrl: null, locale: "ko", idempotencyKey: id };
  expect((await run("suggestions", request("/api", body, true))).status).toBe(201);
  expect(rpc).toHaveBeenCalledWith("fan_web_submit_schedule_suggestion", { p_app_user_id: owner, p_payload: expect.objectContaining({ startsAt: "2026-09-30T16:00:00.000Z", endsAt: null, timeZone: "Asia/Seoul", isOnline: true }) });
  const invalid = await run("suggestions", request("/api", { ...body, startsAtLocal: "2026-11-01T01:30", timeZone: "America/New_York" }, true));
  expect(invalid.status).toBe(422); expect(await invalid.json()).toEqual({ error: { code: "FAN_WEB_LOCAL_TIME_INVALID" } });
});
it("keeps legacy artists while distinguishing a definite fanpage from possible matches", async () => {
  const existing = { slug: "artist-one", name: "Artist", imageUrl: "/artist.webp", href: "/artist-one" };
  rpc.mockResolvedValue({ existingFanpage: existing, possibleMatches: [], artists: [existing] });
  const result = await run("request-check", request("/api", { name: "Artist", officialSocialUrl: "https://instagram.com/artist", locale: "en" }));
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ existingFanpage: existing, possibleMatches: [], artists: [existing] });
});

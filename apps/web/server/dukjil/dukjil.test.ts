import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { awardDukjilAction, dukjilRequestKey } from "./award";
import { createDukjilHandlers } from "./routes";

const user = "20000000-0000-4000-8000-000000000001", key = "10000000-0000-4000-8000-000000000001";
const stamp = "30000000-0000-4000-8000-000000000001";
const celeb = "40000000-0000-4000-8000-000000000001";
const deps = () => ({ rpc: vi.fn(), authorize: vi.fn().mockResolvedValue({ appUserId: user }), resolveCreatorId: vi.fn().mockResolvedValue(celeb) });
const dbCatalog = { active: true, version: 1, effectiveFrom: "2026-12-11", missionBook: null, rules: { actions: {
  post: { points: 5, minChars: 20, pointCap: { per: "user_day", max: 3 }, stamp: { kind: "post", keyMode: "source", capPer: "user_day", capMax: 3 } },
  mission: { pointsMin: 50, pointsMax: 300 },
  invite: { points: 10 },
} } };
const req = (method: string, url: string, body?: unknown, auth = true) => new Request(url, { method, headers: { ...(auth ? { authorization: "Bearer t" } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const attendance = { points: 2, streak: 1, bonusPoints: 0, stampId: stamp, attendanceDate: "2026-11-05", replayed: false };

describe("dukjil routes", () => {
  it("returns an empty catalog while no policy is active", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ active: false });
    const res = await createDukjilHandlers(d).catalog(req("GET", "https://x.test/api/dukjil/catalog"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: null, rules: {}, missionBook: null });
    expect(d.rpc).toHaveBeenCalledWith("read_dukjil_catalog", {});
  });
  it("flattens the active catalog: points, daily limit and stamp kind", async () => {
    const d = deps(); d.rpc.mockResolvedValue(dbCatalog);
    const body = await (await createDukjilHandlers(d).catalog(req("GET", "https://x.test/api/dukjil/catalog?locale=ko"))).json();
    expect(body.version).toBe(1);
    expect(body.rules.post).toMatchObject({ points: 5, dailyLimit: 3, stamp: "post" });
    expect(body.rules.mission).toMatchObject({ points: 50, dailyLimit: null, stamp: null });
    expect(body.rules.invite).toMatchObject({ points: 10, dailyLimit: null, stamp: null });
  });
  it("accepts rules.liveKept and the monthly-capped invite stamp without failing the strict schema", async () => {
    const d = deps();
    d.rpc.mockResolvedValue({ ...dbCatalog, rules: {
      actions: { ...dbCatalog.rules.actions, invite: { points: 200, friendAction: "invite_friend", pointCap: { per: "user_month", max: 5 }, stamp: { kind: "invite", keyMode: "source", capPer: "user_month", capMax: 3 } } },
      liveKept: { note: "n", liveParticipation: "p", perCreatorPolicy: ["journey_completion", "first_clip"], perCreatorPolicyNote: "n" },
      gate: { admission: "입국 심사", companion: "invite", adGate: true },
    } });
    const res = await createDukjilHandlers(d).catalog(req("GET", "https://x.test/api/dukjil/catalog"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules.invite).toMatchObject({ points: 200, dailyLimit: null, stamp: "invite" });
    expect(body.rules).not.toHaveProperty("liveKept");
  });
  it("keeps rules.checkin streak fields in the catalog", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ ...dbCatalog, rules: { actions: { ...dbCatalog.rules.actions, checkin: { points: 2, streakEvery: 7, streakBonus: 10, stamp: { kind: "daily_checkin", capPer: "creator_day", capMax: 1 } } } } });
    const body = await (await createDukjilHandlers(d).catalog(req("GET", "https://x.test/api/dukjil/catalog"))).json();
    expect(body.rules.checkin).toMatchObject({ points: 2, streakEvery: 7, streakBonus: 10, stamp: "daily_checkin" });
  });
  it("today: passes read_dukjil_today through with the creator uuid", async () => {
    const d = deps();
    const db = { kstDate: "2026-12-11", policyActive: true, totalPoints: 10, actions: { post: { count: 2, points: 10, remaining: 1, stamped: false }, checkin: { count: 0, points: 0, remaining: 1, stamped: false } },
      attendance: { attendedToday: false, streak: 3, nextBonusIn: 4 }, hasPassport: true };
    d.rpc.mockResolvedValue(db);
    const res = await createDukjilHandlers(d).today(req("GET", "https://x.test/t?creator=artist"));
    expect(await res.json()).toEqual(db);
    expect(d.resolveCreatorId).toHaveBeenCalledWith("artist");
    expect(d.rpc).toHaveBeenCalledWith("read_dukjil_today", { p_user: user, p_celebrity: celeb });
  });
  it("today: without a creator sends a null celebrity; inactive policy gives only kstDate and policyActive", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ kstDate: "2026-12-11", policyActive: false });
    const res = await createDukjilHandlers(d).today(req("GET", "https://x.test/t"));
    expect(await res.json()).toEqual({ kstDate: "2026-12-11", policyActive: false });
    expect(d.rpc).toHaveBeenCalledWith("read_dukjil_today", { p_user: user, p_celebrity: null });
    expect(d.resolveCreatorId).not.toHaveBeenCalled();
  });
  it("today: unknown creator is 404 and the RPC is not called", async () => {
    const d = deps(); d.resolveCreatorId.mockResolvedValue(null);
    const res = await createDukjilHandlers(d).today(req("GET", "https://x.test/t?creator=ghost"));
    expect(res.status).toBe(404);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("attendance list: batch RPC, unknown slugs dropped, slug added to rows", async () => {
    const d = deps();
    const ids = new Map([["a", celeb], ["b", "40000000-0000-4000-8000-000000000002"]]);
    const resolveCreatorIds = vi.fn().mockResolvedValue(ids);
    d.rpc.mockResolvedValue({ kstDate: "2026-12-11", items: [
      { celebrityId: celeb, attendedToday: true, streak: 2, nextBonusIn: 5, hasPassport: true },
      { celebrityId: "40000000-0000-4000-8000-000000000002", attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false },
    ] });
    const res = await createDukjilHandlers({ ...d, resolveCreatorIds }).attendanceList(req("GET", "https://x.test/a?creators=a,ghost,b,a"));
    expect(resolveCreatorIds).toHaveBeenCalledWith(["a", "ghost", "b"]);
    expect(d.rpc).toHaveBeenCalledWith("read_dukjil_attendance", { p_user: user, p_celebrities: [celeb, "40000000-0000-4000-8000-000000000002"] });
    const body = await res.json();
    expect(body.items.map((i: { creatorSlug: string }) => i.creatorSlug)).toEqual(["a", "b"]);
    expect(body.items[0]).toMatchObject({ celebrityId: celeb, attendedToday: true, streak: 2, nextBonusIn: 5, hasPassport: true });
  });
  it("attendance list: 50 allowed, 51 or none or bad slug is 400, no login is 401", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ kstDate: "2026-12-11", items: [] });
    const h = createDukjilHandlers({ ...d, resolveCreatorIds: async () => new Map() });
    const many = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(",");
    expect((await h.attendanceList(req("GET", `https://x.test/a?creators=${many(50)}`))).status).toBe(200);
    expect((await h.attendanceList(req("GET", `https://x.test/a?creators=${many(51)}`))).status).toBe(400);
    expect((await h.attendanceList(req("GET", "https://x.test/a"))).status).toBe(400);
    expect((await h.attendanceList(req("GET", "https://x.test/a?creators=Bad%20Slug"))).status).toBe(400);
    const anon = deps(); anon.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "x"));
    expect((await createDukjilHandlers(anon).attendanceList(req("GET", "https://x.test/a?creators=a", undefined, false))).status).toBe(401);
    expect(anon.rpc).not.toHaveBeenCalled();
  });
  it("requires login for today and attendance", async () => {
    const d = deps(); d.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "x"));
    const h = createDukjilHandlers(d);
    expect((await h.today(req("GET", "https://x.test/t?creator=a", undefined, false))).status).toBe(401);
    expect((await h.attend(req("POST", "https://x.test/a", { requestKey: key }, false), "a")).status).toBe(401);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("rejects bad input", async () => {
    const h = createDukjilHandlers(deps());
    expect((await h.today(req("GET", "https://x.test/t?creator=Bad%20Slug"))).status).toBe(400);
    expect((await h.attend(req("POST", "https://x.test/a", { requestKey: "no" }), "a")).status).toBe(400);
    expect((await h.attend(req("POST", "https://x.test/a", { requestKey: key, extra: 1 }), "a")).status).toBe(400);
  });
  it("attends once per request key and passes a replay through", async () => {
    const d = deps(); d.rpc.mockResolvedValue({ ...attendance, replayed: true });
    const res = await createDukjilHandlers(d).attend(req("POST", "https://x.test/a", { requestKey: key }), "artist");
    expect((await res.json()).replayed).toBe(true);
    expect(d.rpc).toHaveBeenCalledWith("attend_creator", { p_user: user, p_celebrity: celeb, p_request_key: key });
  });
  it("answers 404 when the creator does not exist", async () => {
    const d = deps(); d.resolveCreatorId.mockResolvedValue(null);
    const res = await createDukjilHandlers(d).attend(req("POST", "https://x.test/a", { requestKey: key }), "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "CREATOR_NOT_FOUND" } });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["PASSPORT_REQUIRED", 403], ["POLICY_INACTIVE", 409], ["DUKJIL_DAILY_LIMIT", 429], ["DUKJIL_CONTENT_TOO_SHORT", 422], ["DUKJIL_PARAMS_INVALID", 400],
    ["FAN_WEB_ACTIVE_ACCOUNT_REQUIRED", 403], ["DUKJIL_CELEBRITY_REQUIRED", 400], ["COMMUNITY_STAMP_WALLET_NOT_READY", 409], ["COMMUNITY_STAMP_NOT_FOUND", 404], ["GROUP_WALLET_REQUEST_CONFLICT", 409],
    ["DUKJIL_ATTENDANCE_MOVED", 409], ["SOURCE_REUSED", 409], ["UNKNOWN_ACTION", 400],
  ])("maps %s to %i", async (code, status) => {
    const d = deps(); d.rpc.mockRejectedValue(new Error(code));
    const res = await createDukjilHandlers(d).attend(req("POST", "https://x.test/a", { requestKey: key }), "artist");
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code } });
  });
  it("answers 503 for unknown failures without leaking details", async () => {
    const d = deps(); d.rpc.mockRejectedValue(new Error("secret db detail"));
    const res = await createDukjilHandlers(d).today(req("GET", "https://x.test/t?creator=a"));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("awardDukjilAction", () => {
  it("makes a deterministic request key", () => {
    expect(dukjilRequestKey(user, "post", "p1")).toBe(dukjilRequestKey(user, "post", "p1"));
    expect(dukjilRequestKey(user, "post", "p1")).not.toBe(dukjilRequestKey(user, "post", "p2"));
    expect(dukjilRequestKey(user, "post", "p1")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("calls the RPC once with the source key", async () => {
    const rpc = vi.fn().mockResolvedValue({ points: 3, stampId: stamp, capped: false, reason: null, replayed: false });
    const resolveCreatorId = vi.fn().mockResolvedValue(celeb);
    const res = await awardDukjilAction({ rpc, resolveCreatorId }, { appUserId: user, creatorSlug: "artist", actionKey: "post", sourceKey: "p1", params: { chars: 30 } });
    expect(res?.points).toBe(3);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_user: user, p_action_key: "post", p_source_key: "p1", p_celebrity: celeb, p_params: { chars: 30 } });
    expect(rpc.mock.calls[0][1].p_request_key).toBe(dukjilRequestKey(user, "post", "p1"));
  });
  it("sends a null celebrity for point-only actions and skips an unknown creator", async () => {
    const rpc = vi.fn().mockResolvedValue({ points: 10, stampId: null, capped: false, reason: null, replayed: false });
    await awardDukjilAction({ rpc }, { appUserId: user, actionKey: "invite", sourceKey: "i1" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_celebrity: null });
    const none = vi.fn(), resolveCreatorId = vi.fn().mockResolvedValue(null);
    expect(await awardDukjilAction({ rpc: none, resolveCreatorId }, { appUserId: user, creatorSlug: "ghost", actionKey: "post", sourceKey: "p" })).toBeNull();
    expect(none).not.toHaveBeenCalled();
  });
  it("returns a partial payout (capped) as a success", async () => {
    const rpc = vi.fn().mockResolvedValue({ points: 0, stampId: stamp, capped: true, reason: "POINT_CAP", replayed: false });
    const res = await awardDukjilAction({ rpc, resolveCreatorId: async () => celeb }, { appUserId: user, creatorSlug: "a", actionKey: "post", sourceKey: "p" });
    expect(res).toMatchObject({ points: 0, capped: true, reason: "POINT_CAP" });
  });
  it.each(["POLICY_INACTIVE", "DUKJIL_DAILY_LIMIT", "PASSPORT_REQUIRED", "SOURCE_REUSED", "DUKJIL_CONTENT_TOO_SHORT", "COMMUNITY_STAMP_WALLET_NOT_READY", "DUKJIL_DUPLICATE_BODY", "DUKJIL_REPEAT_TARGET", "FAN_WEB_ACTIVE_ACCOUNT_REQUIRED"])("stays silent on %s", async (code) => {
    const onError = vi.fn();
    expect(await awardDukjilAction({ rpc: vi.fn().mockRejectedValue(new Error(code)), resolveCreatorId: async () => celeb }, { appUserId: user, creatorSlug: "a", actionKey: "post", sourceKey: "p" }, onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
  it.each(["UNKNOWN_ACTION", "DUKJIL_PARAMS_INVALID", "DUKJIL_CELEBRITY_REQUIRED", "GROUP_WALLET_INVALID"])("logs %s as a call bug", async (code) => {
    const onError = vi.fn();
    await awardDukjilAction({ rpc: vi.fn().mockRejectedValue(new Error(code)), resolveCreatorId: async () => celeb }, { appUserId: user, creatorSlug: "a", actionKey: "post", sourceKey: "p" }, onError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
  it("pays nothing and stays silent while the policy is a draft", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("POLICY_INACTIVE")), onError = vi.fn();
    expect(await awardDukjilAction({ rpc, resolveCreatorId: async () => celeb }, { appUserId: user, creatorSlug: "a", actionKey: "post", sourceKey: "p" }, onError)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
  it("never throws on a real failure and reports it", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("connection reset")), onError = vi.fn();
    expect(await awardDukjilAction({ rpc, resolveCreatorId: async () => celeb }, { appUserId: user, creatorSlug: "a", actionKey: "post", sourceKey: "p" }, onError)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

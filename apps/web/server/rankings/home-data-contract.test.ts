import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { homeCreatorRankingSchema, homeFanRankingSchema, homeFanProfileRefSchema } from "@/features/rankings/domain/types";
import { encodeProfileRef, type ProfileRef } from "@/features/group-social/profile-ref";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createSocialHandlers } from "@/server/social/routes";
import { createRankingsHandlers } from "./routes";
import { HOME_PROFILE_REF_TTL_MS } from "./home-profile-ref";
const profileRefSecret = randomBytes(32).toString("base64");

const viewer = "11111111-1111-4111-8111-111111111111";
const profileRef = { kind: "home_ranking" as const, day: "2026-11-10", computedAt: "2026-11-10T00:00:00Z", metric: "hearts" as const, rank: 1 };
const privateFields = { subjectId: viewer, app_user_id: viewer, userId: viewer, profileId: viewer, email: "private@example.test", last_active_at: "2026-11-10T00:00:00Z" };
const head = { day: "2026-11-10", builtDay: "2026-11-10", computedAt: "2026-11-10T00:00:00Z", comparable: true, state: "ready", today: "2026-11-10", previousDay: "2026-11-09", failedAt: null, weekGainDays: 7 };
const fan = { rank: 1, score: 900, hearts: 12, points: 900, fans: 1, nickname: "Fixture fan", characterId: "star-pink", tier: "Gold", isMe: true, isNew: false, delta: -1, weekGain: 99, dayGain: 3, profileRef, favorite: { slug: "fixture", names: { ko: "예시" }, ...privateFields }, ...privateFields };
const creator = { rank: 1, score: 2, hearts: 12, points: null, fans: 2, slug: "fixture", name: "Fixture", imageUrl: null, challenge: false, liveNow: false, isNew: false, delta: 0, weekGain: 1, dayGain: 3, ...privateFields };
const headKeys = ["day", "computedAt", "comparable", "period", "closesAt", "fetchedAt", "state", "today", "previousDay", "failedAt", "metric", "weekGainDays", "rows"];
const fanKeys = ["rank", "score", "hearts", "points", "fans", "nickname", "characterId", "tier", "isMe", "isNew", "delta", "weekGain", "dayGain", "favorite"];
const creatorKeys = ["rank", "score", "hearts", "points", "fans", "slug", "name", "imageUrl", "challenge", "liveNow", "isNew", "delta", "weekGain", "dayGain"];
const keys = (value: object, allowed: string[]) => expect(Object.keys(value).sort()).toEqual([...allowed].sort());

describe("home ranking public data contract", () => {
  it("rejects another valid rank, viewer, signature, expiry and stale snapshot before opening a profile", async () => {
    let now = Date.parse(head.computedAt);
    let activeViewer = viewer;
    const authorize = async () => ({ appUserId: activeViewer });
    const rankings = createRankingsHandlers({ profileRefSecret, authorize, resolveCreatorId: async () => null,
      rpc: async () => ({ ...head, rows: [fan, { ...fan, rank: 2, profileRef: { ...profileRef, rank: 2 } }], me: null }), now: () => now });
    const headers = { authorization: "Bearer fixture" };
    const rows = homeFanRankingSchema.parse(await (await rankings.home(new Request("http://localhost/api/rankings/home", { headers }))).json()).rows;
    const a = rows[0]!.profileRef!, b = rows[1]!.profileRef!;
    // Both coordinates are real rows returned by the issuing route. A permissive RPC would return either profile.
    const cases = JSON.parse(readFileSync(resolve(__dirname, "../social/b6-sql-responses.json"), "utf8"));
    const rpc = vi.fn(async () => cases.by_ref_signed_in);
    const social = createSocialHandlers({ profileRefSecret, authorize, rpc, now: () => now });
    const open = (ref: ProfileRef) => social.profileByRef(new Request("http://localhost/api/profiles/by-ref?ref=" + encodeProfileRef(ref), { headers }));
    expect((await open(a)).status).toBe(200);
    expect((await open(b)).status).toBe(200);
    rpc.mockClear();
    for (const ref of [{ ...a, rank: b.rank }, { ...a, signature: b.signature }, { ...a, signature: "invalid" },
      { ...a, metric: "points" as const }, { ...a, day: "2026-11-09" }, { ...a, computedAt: "2026-11-09T00:00:00Z" }]) {
      const response = await open(ref);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: "SOCIAL_NOT_FOUND" } });
    }
    activeViewer = "22222222-2222-4222-8222-222222222222";
    expect((await open(a)).status).toBe(404);
    activeViewer = viewer;
    now += HOME_PROFILE_REF_TTL_MS;
    expect((await open(a)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    now -= HOME_PROFILE_REF_TTL_MS;
    // A correctly signed ref whose snapshot was replaced still follows the DB's existing not-found result.
    rpc.mockResolvedValueOnce(null);
    expect((await open(a)).status).toBe(404);
    // Reporting cannot use altered coordinates as a side entrance to the resolver.
    rpc.mockClear();
    const report = await social.reportProfile(new Request("http://localhost/api/profiles/report", { method: "POST", headers,
      body: JSON.stringify({ ref: { ...a, rank: b.rank }, reason: "spam", requestId: viewer }) }));
    expect(report.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  for (const kind of ["fans", "creators"] as const) for (const metric of kind === "fans" ? ["hearts", "points"] : ["fans", "hearts"]) {
    it.each([false, true])(`${kind}/${metric}: returns schema-checked daily hearts and only allowed keys (authenticated=%s)`, async (authenticated) => {
      const rpc = vi.fn(async () => ({ ...head, rows: [kind === "fans" ? { ...fan, profileRef: { ...profileRef, metric } } : creator], me: { rank: 1, score: 900, hearts: 12, points: 900, inTop: true, delta: -1, ...privateFields }, ...privateFields }));
      const authorize = vi.fn(async () => ({ appUserId: viewer }));
      const handlers = createRankingsHandlers({ profileRefSecret, rpc, authorize, resolveCreatorId: async () => null, now: () => Date.parse(head.computedAt) });
      const response = await handlers.home(new Request("http://localhost/api/rankings/home?kind=" + kind + "&metric=" + metric, { headers: authenticated ? { authorization: "Bearer fixture" } : {} }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect((kind === "fans" ? homeFanRankingSchema : homeCreatorRankingSchema).safeParse(body).success).toBe(true);
      expect(body.rows[0].dayGain).toBe(3);
      expect(body.rows[0].dayGain).not.toBe(body.rows[0].weekGain);
      keys(body, kind === "fans" ? [...headKeys, "me"] : headKeys);
      keys(body.rows[0], kind === "fans" ? [...fanKeys, ...(authenticated ? ["profileRef"] : [])] : creatorKeys);
      if (kind === "fans") {
        keys(body.rows[0].favorite, ["slug", "name"]);
        expect(body.rows[0].isMe).toBe(authenticated);
        if (authenticated) {
          expect(homeFanProfileRefSchema.parse(body.rows[0].profileRef)).toMatchObject({ ...profileRef, metric, signature: expect.any(String) });
          keys(body.rows[0].profileRef, ["kind", "day", "computedAt", "metric", "rank", "signature"]);
        } else expect(body.rows[0]).not.toHaveProperty("profileRef");
        if (authenticated) keys(body.me, ["rank", "score", "hearts", "points", "inTop", "delta"]);
        else expect(body.me).toBeNull();
      }
      for (const key of Object.keys(privateFields)) {
        expect(JSON.stringify(body)).not.toContain('"' + key + '"');
      }
      expect(body.rows[0]).not.toHaveProperty("profileId");
      expect(authorize).toHaveBeenCalledTimes(authenticated ? 1 : 0);
      // The creator list also reads the platform follower counts (20261227150001), in a call of its own.
      expect(rpc).toHaveBeenCalledTimes(kind === "creators" ? 2 : 1);
      if (kind === "creators") expect(rpc).toHaveBeenLastCalledWith("read_celebrity_platform_followers", { p_slugs: [creator.slug] });
    });
  }

  it("opens the signed-in ranking ref using ProfileModal's existing by-ref endpoint", async () => {
    const authorize = async () => ({ appUserId: viewer });
    const rankings = createRankingsHandlers({ profileRefSecret, rpc: async () => ({ ...head, rows: [fan], me: null }), authorize, resolveCreatorId: async () => null, now: () => Date.parse(head.computedAt) });
    const response = await rankings.home(new Request("http://localhost/api/rankings/home", { headers: { authorization: "Bearer fixture" } }));
    expect(response.status).toBe(200);
    const row = homeFanRankingSchema.parse(await response.json()).rows[0]!;
    const ref = homeFanProfileRefSchema.parse(row.profileRef);
    const cases = JSON.parse(readFileSync(resolve(__dirname, "../social/b6-sql-responses.json"), "utf8"));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      if (args.p_viewer === null) throw new Error("SOCIAL_FORBIDDEN");
      return JSON.stringify(args.p_ref) === JSON.stringify(profileRef) ? cases.by_ref_signed_in : null;
    });
    const social = createSocialHandlers({ authorize, rpc, profileRefSecret, now: () => Date.parse(head.computedAt) });
    const url = "http://localhost/api/profiles/by-ref?ref=" + encodeProfileRef(ref) + "&locale=ko";
    const opened = await social.profileByRef(new Request(url, { headers: { authorization: "Bearer fixture" } }));
    expect(opened.status).toBe(200);
    expect((await opened.json()).profile.id).toBe("7d000000-0000-4000-8000-000000000002");
    expect(rpc).toHaveBeenCalledWith("read_social_profile_by_ref", { p_viewer: viewer, p_ref: profileRef, p_locale: "ko" });
    const guest = await social.profileByRef(new Request(url));
    expect(guest.status).toBe(403);
    expect(await guest.json()).toEqual({ error: { code: "SOCIAL_FORBIDDEN" } });
    for (const badRef of [{ ...ref, computedAt: "2026-11-09T00:00:00Z" }, { ...ref, rank: 999999 }]) {
      const stale = await social.profileByRef(new Request("http://localhost/api/profiles/by-ref?ref=" + encodeProfileRef(badRef), { headers: { authorization: "Bearer fixture" } }));
      expect(stale.status).toBe(404);
      expect(await stale.json()).toEqual({ error: { code: "SOCIAL_NOT_FOUND" } });
    }
    const malformed = Buffer.from(JSON.stringify({ ...ref, profileId: viewer })).toString("base64url");
    expect((await social.profileByRef(new Request("http://localhost/api/profiles/by-ref?ref=" + malformed, { headers: { authorization: "Bearer fixture" } }))).status).toBe(400);
  });

  it("omits references for an expired token even if the RPC accidentally includes one", async () => {
    const handlers = createRankingsHandlers({ profileRefSecret, rpc: async () => ({ ...head, rows: [fan], me: null }), authorize: async () => { throw new AuthError("AUTHENTICATION_REQUIRED", 401, "expired"); }, resolveCreatorId: async () => null, now: () => Date.parse(head.computedAt) });
    const response = await handlers.home(new Request("http://localhost/api/rankings/home", { headers: { authorization: "Bearer expired" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    keys(body.rows[0], fanKeys);
    expect(JSON.stringify(body)).not.toMatch(/profileRef|profileId|subjectId|app_user_id|last_active_at/);
  });

  it.each([undefined, null, { kind: "profile", profileId: "invalid" }, { ...profileRef, email: "private@example.test" }])("fails closed when a signed-in reference is missing or invalid: %j", async (badRef) => {
    const handlers = createRankingsHandlers({ profileRefSecret, rpc: async () => ({ ...head, rows: [{ ...fan, profileRef: badRef }], me: null }), authorize: async () => ({ appUserId: viewer }), resolveCreatorId: async () => null, now: () => Date.parse(head.computedAt) });
    const response = await handlers.home(new Request("http://localhost/api/rankings/home", { headers: { authorization: "Bearer fixture" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "RANKING_UNAVAILABLE" } });
  });

  it.each([null, undefined, -2, 0, 5])("retains unknown, zero and signed differences: %s", async (dayGain) => {
    const handlers = createRankingsHandlers({ profileRefSecret, rpc: async () => ({ ...head, rows: [{ ...fan, dayGain }], me: null }), authorize: async () => ({ appUserId: viewer }), resolveCreatorId: async () => null, now: () => Date.parse(head.computedAt) });
    const response = await handlers.home(new Request("http://localhost/api/rankings/home"));
    expect(response.status).toBe(200);
    expect((await response.json()).rows[0].dayGain).toBe(dayGain ?? null);
  });

  it("refreshes at KST midnight even when yesterday's snapshot is one second old", async () => {
    let now = Date.parse("2026-11-10T14:59:59Z");
    let snapshot = { ...head, computedAt: new Date(now).toISOString(), rows: [{ ...fan, dayGain: 8 }], me: null };
    const rpc = vi.fn(async (name: string) => {
      if (name === "ensure_home_rankings") {
        snapshot = { ...snapshot, day: "2026-11-11", builtDay: "2026-11-11", computedAt: new Date(now).toISOString(), rows: [{ ...fan, dayGain: 0 }] };
        return { built: true };
      }
      return snapshot;
    });
    const handlers = createRankingsHandlers({ profileRefSecret, rpc, authorize: async () => ({ appUserId: viewer }), resolveCreatorId: async () => null, now: () => now });
    const get = () => handlers.home(new Request("http://localhost/api/rankings/home"));
    expect((await (await get()).json()).rows[0].dayGain).toBe(8);
    expect(rpc).toHaveBeenCalledTimes(1);
    now += 1000;
    const body = await (await get()).json();
    expect(body.day).toBe("2026-11-11");
    expect(body.rows[0].dayGain).toBe(0);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_home_fan_ranking_v2", "read_home_fan_ranking_v2", "ensure_home_rankings", "read_home_fan_ranking_v2"]);
  });
});

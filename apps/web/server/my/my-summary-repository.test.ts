import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PublicImageMySummaryRepository, SupabaseMySummaryRepository, SupabasePassportHeartsReader, SupabaseProfileFavoriteReader, type PassportHeartsReader, type ProfileFavoriteReader } from "./my-summary-repository";
import { mySummarySchema, ownerMySummarySchema } from "../../features/my/domain/my-summary";

const id = "11111111-1111-4111-8111-111111111111";
const valid = { profile: { nickname: null }, creators: [], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 };

describe("MY summary repository", () => {
  it("opts into the stage RPC without rewriting authoritative progress", async () => {
    const stageProgress = { policyVersion: 2, current: { key: "silver-1", tier: "Silver", subdivision: 1, rank: 2, minimumScore: 15 }, next: { key: "silver-2", tier: "Silver", subdivision: 2, rank: 3, minimumScore: 30 }, remaining: 8, progressPercent: 46 };
    const data = { ...valid, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg" }, relationship: "passport", passport: { id, tier: "Silver", score: 22, remainingToNextTier: 28, stageProgress }, ticketBalance: 0, firstReaction: null }] };
    const rpc = vi.fn(async () => ({ data, error: null }));
    const result = await new SupabaseMySummaryRepository({ rpc }).get({ appUserId: id, locale: "en", asOf: new Date("2026-09-10T00:00:00Z"), includeStages: true });
    expect(result).toEqual(data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_owned_my_fan_activity_with_stages", { p_app_user_id: id, p_locale: "en", p_as_of: "2026-09-10T00:00:00.000Z" });
  });
  it("drops only stage detail when the stage projection is rejected", async () => {
    const bad = { ...valid, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg" }, relationship: "passport", passport: { id, tier: "Bronze", score: 0, remainingToNextTier: 1, stageProgress: { policyVersion: 3, current: { key: "bronze-1", tier: "Bronze", subdivision: 1, rank: 1, minimumScore: 0 }, next: { key: "silver-1", tier: "Silver", subdivision: 1, rank: 2, minimumScore: 0 }, remaining: 0, progressPercent: 0 } }, ticketBalance: 0, firstReaction: null }] };
    const plain = { ...bad, creators: [{ ...bad.creators[0], passport: { ...bad.creators[0].passport, stageProgress: undefined } }] };
    const rpc = vi.fn(async (name: string) => ({ data: name.endsWith("_with_stages") ? bad : plain, error: null }));
    const result = await new SupabaseMySummaryRepository({ rpc }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeStages: true });
    expect(result.creators[0]?.passport?.stageProgress).toBeUndefined();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["get_owned_my_fan_activity_with_stages", "get_owned_my_fan_activity"]);
  });
  it("keeps failing after the stage fallback on RPC errors and on stage-less invalid projections", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValueOnce({ data: { nope: true }, error: null }).mockResolvedValueOnce({ data: null, error: {} });
    await expect(new SupabaseMySummaryRepository({ rpc }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeStages: true })).rejects.toThrow("query failed");
    const invalid = vi.fn().mockResolvedValue({ data: { nope: true }, error: null });
    await expect(new SupabaseMySummaryRepository({ rpc: invalid }).get({ appUserId: id, locale: "ko", asOf: new Date() })).rejects.toThrow("projection is invalid");
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("MY_SUMMARY_STAGE_FALLBACK", { reason: "STAGE_PROJECTION_INVALID" });
    warn.mockRestore();
  });
  it("uses one owner-scoped RPC with an explicit clock", async () => {
    const rpc = vi.fn(async () => ({ data: valid, error: null }));
    const repository = new SupabaseMySummaryRepository({ rpc });
    await expect(repository.get({ appUserId: id, locale: "ko", asOf: new Date("2026-09-04T00:00:00Z") })).resolves.toEqual(valid);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_owned_my_fan_activity", { p_app_user_id: id, p_locale: "ko", p_as_of: "2026-09-04T00:00:00.000Z" });
  });
  it("moves elapsed scheduled reservations into history without inventing an ended status", async () => {
    const event = { id, slug: "ifew-live", title: "이퓨 정기 LIVE", startsAt: "2026-09-29T22:00:00Z", effectiveStatus: "scheduled", attended: false };
    const future = { ...event, id: "22222222-2222-4222-8222-222222222222", slug: "future-live", startsAt: "2026-10-10T00:00:00Z" };
    const live = { ...event, id: "33333333-3333-4333-8333-333333333333", slug: "live-now", effectiveStatus: "live" };
    const ended = { ...event, id: "44444444-4444-4444-8444-444444444444", slug: "ended-live", startsAt: "2026-09-01T00:00:00Z", effectiveStatus: "ended", attended: true };
    const data = { ...valid, live: { upcoming: [event, future, live], history: [ended] } };
    const repository = new SupabaseMySummaryRepository({ rpc: async () => ({ data, error: null }) });
    const result = await repository.get({ appUserId: id, locale: "ko", asOf: new Date("2026-10-09T00:00:00Z") });
    expect(result.live).toEqual({ upcoming: [live, future], history: [event, ended] });
    expect(data.live.upcoming).toEqual([event, future, live]);
  });
  it("fails closed on database and projection errors", async () => {
    await expect(new SupabaseMySummaryRepository({ rpc: async () => ({ data: null, error: {} }) }).get({ appUserId: id, locale: "en", asOf: new Date() })).rejects.toThrow("query failed");
    await expect(new SupabaseMySummaryRepository({ rpc: async () => ({ data: { nope: true }, error: null }) }).get({ appUserId: id, locale: "en", asOf: new Date() })).rejects.toThrow("projection is invalid");
  });

  it("keeps the owner RPC contract unchanged", async () => {
    const data = { ...valid, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg", isPublic: true }, relationship: "passport", passport: null, ticketBalance: 0, firstReaction: null }] };
    await expect(new SupabaseMySummaryRepository({ rpc: async () => ({ data, error: null }) }).get({ appUserId: id, locale: "ko", asOf: new Date() })).rejects.toThrow("projection is invalid");
  });

  it("combines public directory state while preserving private owner records", async () => {
    const data = {
      ...valid,
      creators: [
        { celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg" }, relationship: "passport" as const, passport: null, ticketBalance: 0, firstReaction: null },
        { celebrity: { slug: "private", name: "Private", image: "/private.jpg" }, relationship: "passport" as const, passport: { id, tier: "Silver" as const, score: 22, remainingToNextTier: 28 }, ticketBalance: 7, firstReaction: null },
      ],
    };
    const readCelebrityPhotoSetsBySlug = vi.fn().mockResolvedValue({ kara: { portrait: null } });
    const list = vi.fn().mockResolvedValue([{ slug: "kara" }]);
    const repository = new PublicImageMySummaryRepository(
      new SupabaseMySummaryRepository({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }),
      { readCelebrityPhotoSetsBySlug, readLivePhotoSetsBySlug: vi.fn() },
      { list },
    );

    const result = await repository.get({ appUserId: id, locale: "ko", asOf: new Date() });

    expect(readCelebrityPhotoSetsBySlug).toHaveBeenCalledExactlyOnceWith(["kara", "private"]);
    expect(list).toHaveBeenCalledExactlyOnceWith("ko");
    expect(result.creators[0]?.celebrity).toMatchObject({ isPublic: true, photos: { portrait: null } });
    expect(result.creators[1]).toMatchObject({ celebrity: { isPublic: false }, passport: { score: 22 }, ticketBalance: 7 });
  });

  it("does not reinterpret a failed public directory read as private", async () => {
    const data = { ...valid, creators: [{ celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg" }, relationship: "passport" as const, passport: null, ticketBalance: 0, firstReaction: null }] };
    const repository = new PublicImageMySummaryRepository(
      new SupabaseMySummaryRepository({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }),
      { readCelebrityPhotoSetsBySlug: vi.fn().mockResolvedValue({}), readLivePhotoSetsBySlug: vi.fn() },
      { list: vi.fn().mockRejectedValue(new Error("directory unavailable")) },
    );

    await expect(repository.get({ appUserId: id, locale: "ko", asOf: new Date() })).rejects.toThrow("directory unavailable");
  });

  describe("hearts (C1 header ♥N)", () => {
    const creatorId = "22222222-2222-4222-8222-222222222222";
    const data = { ...valid, creators: [
      { celebrity: { slug: "kara", name: "KARA", image: "/kara.jpg" }, relationship: "first_reaction_only" as const, passport: null, ticketBalance: 0, firstReaction: null },
      { celebrity: { slug: "elina", name: "Elina", image: "/e.jpg" }, relationship: "passport" as const, passport: { id, tier: "Silver" as const, score: 300, remainingToNextTier: 0 }, ticketBalance: 4, firstReaction: null },
    ] };
    const make = (hearts?: PassportHeartsReader) => new PublicImageMySummaryRepository(
      new SupabaseMySummaryRepository({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }),
      { readCelebrityPhotoSetsBySlug: vi.fn().mockResolvedValue({}), readLivePhotoSetsBySlug: vi.fn() },
      { list: vi.fn().mockResolvedValue([{ slug: "kara" }, { slug: "elina" }]) },
      hearts,
    );
    it("adds passport.hearts only when asked, from passport_hearts and not from score", async () => {
      const read = vi.fn().mockResolvedValue(new Map([[id, 12]]));
      const asked = await make({ read }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeHearts: true });
      expect(read).toHaveBeenCalledExactlyOnceWith(id, [id]);
      expect(asked.creators[1]?.passport).toMatchObject({ score: 300, hearts: 12 });
      expect(asked.creators[0]?.passport).toBeNull();
      expect(() => mySummarySchema.parse(asked)).not.toThrow();
      const plain = await make({ read }).get({ appUserId: id, locale: "ko", asOf: new Date() });
      expect(plain.creators[1]?.passport).not.toHaveProperty("hearts");
      expect(read).toHaveBeenCalledTimes(1);
    });
    it("leaves hearts out, and still answers, when the hearts read fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await make({ read: vi.fn().mockRejectedValue(new Error("down")) }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeHearts: true });
      expect(result.creators[1]?.passport).not.toHaveProperty("hearts");
      warn.mockRestore();
    });
    it("the schema accepts the hearts key (the server sends it only with hearts=1)", () => {
      expect(ownerMySummarySchema.safeParse({ ...data, creators: [{ ...data.creators[1], passport: { ...data.creators[1]!.passport, hearts: 1 } }] }).success).toBe(true);
    });
    it("reads each owned passport's creator, then passport_hearts(user, creator)", async () => {
      const inFn = vi.fn().mockResolvedValue({ data: [{ id, celebrity_id: creatorId }], error: null });
      const eq = vi.fn(() => ({ in: inFn }));
      const rpc = vi.fn().mockResolvedValue({ data: 7, error: null });
      const reader = new SupabasePassportHeartsReader({ rpc, from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) } as never);
      expect([...(await reader.read(id, [id]))]).toEqual([[id, 7]]);
      expect(eq).toHaveBeenCalledWith("app_user_id", id);
      expect(rpc).toHaveBeenCalledWith("passport_hearts", { p_user: id, p_celebrity: creatorId });
      expect((await reader.read(id, [])).size).toBe(0);
    });
  });

  describe("favorite named in MY (D's read_owned_fan_profile_public)", () => {
    const data = { ...valid, creators: [] };
    const make = (favorite?: ProfileFavoriteReader) => new PublicImageMySummaryRepository(
      new SupabaseMySummaryRepository({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }),
      { readCelebrityPhotoSetsBySlug: vi.fn().mockResolvedValue({}), readLivePhotoSetsBySlug: vi.fn() },
      { list: vi.fn().mockResolvedValue([]) }, undefined, favorite,
    );
    it("adds it with hearts=1 and leaves the key out when the read fails (before that migration) or was not asked", async () => {
      const read = vi.fn().mockResolvedValue({ slug: "elina", name: "엘리나" });
      expect((await make({ read }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeHearts: true })).favorite).toEqual({ slug: "elina", name: "엘리나" });
      expect(await make({ read }).get({ appUserId: id, locale: "ko", asOf: new Date() })).not.toHaveProperty("favorite");
      expect(await make({ read: vi.fn().mockRejectedValue(new Error("missing function")) }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeHearts: true })).not.toHaveProperty("favorite");
      expect((await make({ read: vi.fn().mockResolvedValue(null) }).get({ appUserId: id, locale: "ko", asOf: new Date(), includeHearts: true })).favorite).toBeNull();
    });
    it("reads only the favorite out of D's response shape", async () => {
      const rpc = vi.fn().mockResolvedValue({ data: { favorite: { slug: "elina", name: "엘리나" }, links: [], bio: null, favoriteOptions: [] }, error: null });
      expect(await new SupabaseProfileFavoriteReader({ rpc }).read(id, "ko")).toEqual({ slug: "elina", name: "엘리나" });
      expect(rpc).toHaveBeenCalledWith("read_owned_fan_profile_public", { p_app_user_id: id, p_locale: "ko" });
      await expect(new SupabaseProfileFavoriteReader({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "function does not exist" } }) }).read(id, "ko")).rejects.toThrow();
    });
  });
});

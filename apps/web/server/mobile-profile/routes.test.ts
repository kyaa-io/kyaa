import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createMobileProfileHandlers,
  type MobileProfileDependencies,
} from "./routes";

const owner = "11111111-1111-4111-8111-111111111111";
const favorite = { slug: "elina", name: "Elina", imageUrl: "/elina.webp" };
const accountLevel = {
  ruleVersion: "favorite-xp-sum-v1" as const,
  status: "configured" as const,
  tier: "Gold" as const,
  xp: 72,
  progress: { policyVersion: 2 },
};
function setup(result: unknown) {
  const rpc = vi.fn(async (name: string) =>
    name === "read_owned_mobile_default_passport"
      ? null
      : name === "read_owned_mobile_passport_presentation"
        ? { liveRecords: [] }
        : name === "read_owned_mobile_passport_public_stamp_count"
          ? 0
        : name === "read_owned_mobile_stamp_presentation"
          ? null
          : result,
  );
  const deps = {
    authorize: vi.fn(async () => ({ appUserId: owner })),
    rpc,
    passports: {
      findCollection: vi.fn(),
      findPassport: vi.fn(),
      findStamp: vi.fn(),
    },
  } as unknown as MobileProfileDependencies;
  return { api: createMobileProfileHandlers(deps), deps, rpc };
}
const request = (path: string) =>
  new Request(`https://byus.test${path}`, {
    headers: { authorization: "Bearer valid" },
  });
const post = (path: string, body: unknown) =>
  new Request(`https://byus.test${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer valid",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("mobile profile routes", () => {
  it("returns owner-scoped stamp opportunities", async () => {
    const value = {
      items: [
        { kind: "first_friend", earned: true, target: { type: "friends", id: null } },
        { kind: "invite", earned: false, target: { type: "invitations", id: null } },
        { kind: "first_clip", earned: false, target: { type: "fan_clips", id: "elina" } },
      ],
    };
    const { api, rpc } = setup(value);
    const response = await api.stampOpportunities(
      request("/api/me/mobile-profile/stamp-opportunities?locale=ko"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(value);
    expect(rpc).toHaveBeenCalledWith("read_owned_mobile_stamp_opportunities", {
      p_app_user_id: owner,
      p_locale: "ko",
    });
  });
  it("returns real summary counters with the configured account level", async () => {
    const value = {
      profile: {
        nickname: "별빛",
        avatarUrl: "/images/avatars/star-pink.webp",
        preferredFavorite: favorite,
      },
      counts: { stamps: 3, friends: 2, goods: 1 },
      passports: { count: 1, stampCount: 3 },
      recentActivity: null,
      accountLevel,
    };
    const { api, rpc } = setup(value);
    const response = await api.summary(
      request("/api/me/mobile-profile?locale=ko"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(value);
    expect(rpc).toHaveBeenCalledWith("read_owned_mobile_profile", {
      p_app_user_id: owner,
      p_locale: "ko",
    });
  });
  it("encodes the database activity cursor and forwards it on the next page", async () => {
    const cursor = {
      at: "2026-10-11T00:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222",
      kind: "fan_post" as const,
    };
    const { api, rpc } = setup({ items: [], nextCursor: cursor });
    const first = await api.activities(
      request("/api/me/mobile-profile/activities?favoriteSlug=elina&limit=10"),
    );
    const body = (await first.json()) as { nextCursor: string };
    expect(body.nextCursor).toBeTruthy();
    await api.activities(
      request(`/api/me/mobile-profile/activities?cursor=${body.nextCursor}`),
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "read_owned_mobile_profile_activities",
      expect.objectContaining({
        p_before: cursor.at,
        p_before_id: cursor.id,
        p_before_kind: cursor.kind,
      }),
    );
  });
  it("rejects duplicate query values before authorization or RPC", async () => {
    const { api, deps, rpc } = setup({});
    const response = await api.levels(
      request("/api/me/mobile-profile/levels?locale=ko&locale=en"),
    );
    expect(response.status).toBe(400);
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not expose another owner's passport through the mobile alias", async () => {
    const { api, deps } = setup({});
    vi.mocked(deps.passports.findPassport).mockResolvedValue(null);
    const id = "33333333-3333-4333-8333-333333333333";
    const response = await api.passport(
      request(`/api/me/mobile-profile/passports/${id}`),
      id,
    );
    expect(response.status).toBe(404);
    expect(deps.passports.findPassport).toHaveBeenCalledWith({
      id,
      appUserId: owner,
      locale: "ko",
    });
  });
  it("returns the owner-scoped default passport without querying fan passports", async () => {
    const value = {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "default",
      name: "ByUs",
      imageUrl: "/byus-app-icon-512.png",
      ownerNickname: "별빛",
      passportNumber: "BU 000123",
      issuedAt: "2026-10-12T00:00:00.000Z",
      stamps: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          kind: "friend",
          title: "첫 팬 친구",
          issuedAt: "2026-10-12T01:00:00.000Z",
        },
      ],
    };
    const { api, deps, rpc } = setup({});
    rpc.mockImplementation(async (name: string) =>
      name === "read_owned_mobile_default_passport" ? value : null,
    );
    const response = await api.passport(
      request(`/api/me/mobile-profile/passports/${value.id}`),
      value.id,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ passport: value });
    expect(deps.passports.findPassport).not.toHaveBeenCalled();
  });
  it("adds only the explicit public stamp count to a favorite passport", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const { api, deps, rpc } = setup({});
    vi.mocked(deps.passports.findPassport).mockResolvedValue({
      id,
      owner: { nickname: "별빛" },
      celebrity: {
        slug: "elina",
        name: "Elina",
        image: { url: "/elina.webp", alt: "Elina" },
      },
      issuedAt: "2026-10-12T00:00:00.000Z",
      score: { points: 4, level: "Bronze" },
      progress: { remainingPoints: 96, percent: 4 },
      stamps: [],
    } as never);
    rpc.mockImplementation(async (name: string) =>
      name === "read_owned_mobile_default_passport"
        ? null
        : name === "read_owned_mobile_passport_presentation"
          ? { liveRecords: [] }
          : name === "read_owned_mobile_passport_public_stamp_count"
            ? 0
            : null,
    );

    const response = await api.passport(
      request(`/api/me/mobile-profile/passports/${id}`),
      id,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).passport.publicStampCount).toBe(0);
    expect(rpc).toHaveBeenCalledWith(
      "read_owned_mobile_passport_public_stamp_count",
      { p_app_user_id: owner, p_passport_id: id },
    );
  });
  it("creates a passport-scoped share with explicit visibility", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const token = "a".repeat(32);
    const { api, rpc } = setup({ token });
    const response = await api.sharePassport(
      post(`/api/me/mobile-profile/passports/${id}/share`, {
        includeNickname: false,
        includePublicStamps: true,
      }),
      id,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token });
    expect(rpc).toHaveBeenCalledWith("create_mobile_passport_share_link", {
      p_app_user_id: owner,
      p_passport_id: id,
      p_include_nickname: false,
      p_include_public_stamps: true,
    });
  });
  it("rejects incomplete passport share visibility before authorization", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const { api, deps, rpc } = setup({});
    const response = await api.sharePassport(
      post(`/api/me/mobile-profile/passports/${id}/share`, {
        includeNickname: true,
      }),
      id,
    );
    expect(response.status).toBe(400);
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

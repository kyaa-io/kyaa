import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../onchain/owner-mint-replacement", () => ({ validateOwnerMintReplacements: vi.fn(async <T>(mints: T[]) => mints) }));
import { createCommunityStampHandlers } from "./routes";
import { resolveInviteShortLink } from "./invite-short-link";

const owner = "11111111-1111-4111-8111-111111111111";
const page = "10000000-0000-4000-8000-000000000001";
// 261107-2 E3
it("makes a short invite address for the signed-in fan only, with the owner taken from the session", async () => {
  const rpc = vi.fn(async () => ({ slug: "ab2cdef" }));
  const api = createCommunityStampHandlers({ rpc, authorize: vi.fn(async () => ({ appUserId: owner })) });
  const response = await api.action(new Request("https://kyaa.io/api/community-stamps/invite-short-link", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify({ destination: `/pages/groups/${page}` }) }), "invite-short-link");
  expect(await response.json()).toEqual({ slug: "ab2cdef" });
  expect(rpc).toHaveBeenCalledWith("create_community_invite_short_link", { p_app_user_id: owner, p_destination: `/pages/groups/${page}` });
  const extra = await api.action(new Request("https://kyaa.io/api/community-stamps/invite-short-link", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify({ destination: "/", appUserId: "x" }) }), "invite-short-link");
  expect(extra.status).toBe(400);
});
it("opens the same landing as the long address, keeps only campaign tags, and hides unknown addresses", async () => {
  const rpc = vi.fn(async () => ({ code: "22FAA88E23ACE107E6105E21", destination: `/pages/groups/${page}` }));
  const target = await resolveInviteShortLink("ab2cdef", "ko", { rpc }, new URLSearchParams({ utm_source: "kakao", next: "https://evil.example" }));
  const url = new URL(target!, "https://kyaa.io");
  expect(url.pathname).toBe("/my/invitations");
  expect(url.searchParams.get("code")).toBe("22FAA88E23ACE107E6105E21");
  expect(url.searchParams.get("destination")).toBe(`/pages/groups/${page}`);
  expect(url.searchParams.get("utm_source")).toBe("kakao");
  expect(url.searchParams.has("next")).toBe(false);
  expect(await resolveInviteShortLink("ab2cdef", "ko", { rpc: vi.fn(async () => { throw new Error("COMMUNITY_STAMP_NOT_FOUND"); }) })).toBeNull();
  const untouched = vi.fn();
  expect(await resolveInviteShortLink("../../x", "ko", { rpc: untouched })).toBeNull();
  expect(untouched).not.toHaveBeenCalled();
});

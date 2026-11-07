import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/social/dependencies", async () => {
  const { createSocialHandlers } = await import("@/server/social/routes");
  return { createSocialRouteHandlers: () => createSocialHandlers(state), socialUnavailable: () => Response.json({ error: { code: "SOCIAL_UNAVAILABLE" } }, { status: 503 }) };
});
import { AuthError } from "@/features/auth/domain/auth-errors";
import { GET, PUT } from "./route";

const ME = "11111111-1111-4111-8111-111111111111";
const saved = { favorite: { slug: "elina", name: "엘리나" }, links: ["https://www.instagram.com/fan"], bio: "한 줄", favoriteOptions: [{ slug: "elina", name: "엘리나" }] };
const request = (method: string, body?: unknown) => new Request("https://byus.test/api/me/social/profile-fields?locale=ko", { method, headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({ appUserId: ME });
  state.rpc.mockResolvedValue(saved);
});

it("reads only the owner's fields, private and uncached", async () => {
  const res = await GET(request("GET"));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toEqual(saved);
  expect(state.rpc).toHaveBeenCalledWith("read_owned_fan_profile_public", { p_app_user_id: ME, p_locale: "ko" });
});

it("saves checked fields and refuses a bad link before SQL", async () => {
  expect((await PUT(request("PUT", { favoriteSlug: "elina", links: ["https://www.instagram.com/fan"], bio: "한 줄" }))).status).toBe(200);
  state.rpc.mockClear();
  expect((await PUT(request("PUT", { favoriteSlug: null, links: ["javascript:alert(1)"], bio: null }))).status).toBe(400);
  expect(state.rpc).not.toHaveBeenCalled();
});

it("asks a signed-out caller to sign in", async () => {
  state.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
  expect((await GET(request("GET"))).status).toBe(401);
});

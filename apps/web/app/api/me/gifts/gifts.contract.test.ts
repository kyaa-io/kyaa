import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { GiftRouteDependencies } from "@/server/gifts/gift-route";

vi.mock("server-only", () => ({}));
const dependencies = vi.hoisted(() => ({ current: undefined as unknown as GiftRouteDependencies }));
vi.mock("@/server/gifts/gift-route-dependencies", () => ({ createGiftRouteDependencies: () => dependencies.current }));
import { GET } from "./route";

const owner = "00000000-0000-4000-8000-0000000000aa";
beforeEach(() => {
  dependencies.current = {
    authorize: vi.fn().mockResolvedValue({ appUserId: owner }),
    repository: { list: vi.fn().mockResolvedValue([]), find: vi.fn(), markRead: vi.fn(), unread: vi.fn() },
  };
});

describe("GET /api/me/gifts", () => {
  it("lists the verified owner's gifts, never one named in the query, and is not cached", async () => {
    const response = await GET(new Request("https://byus.test/api/me/gifts?locale=en&appUserId=someone-else", { headers: { authorization: "Bearer t" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gifts: [] });
    expect(dependencies.current.repository.list).toHaveBeenCalledWith({ appUserId: owner, locale: "en" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("answers 401 without reading anything for a signed-out request", async () => {
    vi.mocked(dependencies.current.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in required"));
    const response = await GET(new Request("https://byus.test/api/me/gifts"));
    expect(response.status).toBe(401);
    expect(dependencies.current.repository.list).not.toHaveBeenCalled();
  });
  it("does not turn a database failure into an empty gift box", async () => {
    vi.mocked(dependencies.current.repository.list).mockRejectedValue(new Error("down"));
    const response = await GET(new Request("https://byus.test/api/me/gifts"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "GIFTS_UNAVAILABLE" } });
  });
  it("rejects a locale it does not serve", async () => {
    const response = await GET(new Request("https://byus.test/api/me/gifts?locale=xx"));
    expect(response.status).toBe(400);
    expect(dependencies.current.repository.list).not.toHaveBeenCalled();
  });
});

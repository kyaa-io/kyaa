import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { GiftRouteDependencies } from "@/server/gifts/gift-route";

vi.mock("server-only", () => ({}));
const dependencies = vi.hoisted(() => ({ current: undefined as unknown as GiftRouteDependencies }));
vi.mock("@/server/gifts/gift-route-dependencies", () => ({ createGiftRouteDependencies: () => dependencies.current }));
import { POST } from "./route";

const owner = "00000000-0000-4000-8000-0000000000aa";
const id = "5ee1f700-0000-4000-8000-000000000001";
const context = (value: string) => ({ params: Promise.resolve({ rewardResultId: value }) });
beforeEach(() => {
  dependencies.current = {
    authorize: vi.fn().mockResolvedValue({ appUserId: owner }),
    repository: { list: vi.fn(), find: vi.fn(), markRead: vi.fn().mockResolvedValue({ unreadCount: 0, singleUnreadId: null }), unread: vi.fn() },
  };
});

describe("POST /api/me/gifts/[rewardResultId]/read", () => {
  it("marks the verified owner's gift read and returns the remaining unread count", async () => {
    const response = await POST(new Request(`https://byus.test/api/me/gifts/${id}/read`, { method: "POST" }), context(id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unreadCount: 0, singleUnreadId: null });
    expect(dependencies.current.repository.markRead).toHaveBeenCalledWith({ appUserId: owner, rewardResultId: id });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("answers 404 when the gift is not this fan's published win", async () => {
    vi.mocked(dependencies.current.repository.markRead).mockResolvedValue(null);
    const response = await POST(new Request(`https://byus.test/api/me/gifts/${id}/read`, { method: "POST" }), context(id));
    expect(response.status).toBe(404);
  });
  it("never writes for a signed-out request", async () => {
    vi.mocked(dependencies.current.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in required"));
    const response = await POST(new Request(`https://byus.test/api/me/gifts/${id}/read`, { method: "POST" }), context(id));
    expect(response.status).toBe(401);
    expect(dependencies.current.repository.markRead).not.toHaveBeenCalled();
  });
});

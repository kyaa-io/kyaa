import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GiftRouteDependencies } from "@/server/gifts/gift-route";

vi.mock("server-only", () => ({}));
const dependencies = vi.hoisted(() => ({ current: undefined as unknown as GiftRouteDependencies }));
vi.mock("@/server/gifts/gift-route-dependencies", () => ({ createGiftRouteDependencies: () => dependencies.current }));
import { GET } from "./route";

const owner = "00000000-0000-4000-8000-0000000000aa";
const id = "5ee1f700-0000-4000-8000-000000000001";
const context = (value: string) => ({ params: Promise.resolve({ rewardResultId: value }) });
beforeEach(() => {
  dependencies.current = {
    authorize: vi.fn().mockResolvedValue({ appUserId: owner }),
    repository: { list: vi.fn(), find: vi.fn().mockResolvedValue(null), markRead: vi.fn(), unread: vi.fn() },
  };
});

describe("GET /api/me/gifts/[rewardResultId]", () => {
  it("answers one 404 for another fan's gift, a result that was not a win and an unknown id", async () => {
    const response = await GET(new Request(`https://byus.test/api/me/gifts/${id}`), context(id));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "GIFT_NOT_FOUND" } });
    expect(dependencies.current.repository.find).toHaveBeenCalledWith({ appUserId: owner, rewardResultId: id, locale: "ko" });
  });
  it("answers 404 for a malformed id without reading", async () => {
    const response = await GET(new Request("https://byus.test/api/me/gifts/not-an-id"), context("not-an-id"));
    expect(response.status).toBe(404);
    expect(dependencies.current.repository.find).not.toHaveBeenCalled();
  });
  it("does not report a database failure as a missing gift", async () => {
    vi.mocked(dependencies.current.repository.find).mockRejectedValue(new Error("down"));
    const response = await GET(new Request(`https://byus.test/api/me/gifts/${id}`), context(id));
    expect(response.status).toBe(503);
  });
});

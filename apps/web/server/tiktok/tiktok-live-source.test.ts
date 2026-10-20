import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchTikTokLiveObservation } from "./tiktok-live-source";

const observedAt = "2026-10-21T00:00:00.000Z";
const roomId = "7698808886958721812";
const observe = (liveRoom: Record<string, unknown>, user: Record<string, unknown> = { uniqueId: "chang._.a", roomId }) =>
  fetchTikTokLiveObservation("chang._.a", {
    now: () => new Date(observedAt),
    fetchImpl: vi.fn().mockResolvedValue(Response.json({ statusCode: 0, data: { user, liveRoom } })),
  });

describe("TikTok current viewer snapshot", () => {
  it("retains the validated room identity and current count, including zero", async () => {
    for (const viewers of [17, 0]) expect(await observe({ status: 2, liveRoomStats: { userCount: viewers, enterCount: 9000 } }))
      .toMatchObject({ state: "live", roomId, viewers, observedAt });
  });
  it("keeps missing, non-number, negative and unsafe counts unknown without using entry totals", async () => {
    for (const userCount of [undefined, null, -1, 1.5, "17", Number.MAX_SAFE_INTEGER + 1]) {
      expect(await observe({ status: 2, liveRoomStats: { userCount, enterCount: 9000 } })).toMatchObject({ state: "live", viewers: null });
    }
    expect(await observe({ status: 2 })).toMatchObject({ state: "live", viewers: null });
  });
  it("discards leftover room counts when offline", async () => {
    expect(await observe({ status: 4, liveRoomStats: { userCount: 5164, enterCount: 20000 } }))
      .toEqual({ state: "offline", observedAt });
  });
  it("requires matching account and a validated live room", async () => {
    for (const user of [{ uniqueId: "someone", roomId }, { uniqueId: "chang._.a", roomId: "0" }, { uniqueId: "chang._.a", roomId: Number.MAX_SAFE_INTEGER + 1 }, { uniqueId: "chang._.a" }]) {
      expect(await observe({ status: 2, liveRoomStats: { userCount: 17 } }, user)).toEqual({ state: "unavailable", observedAt });
    }
    expect(await observe({ status: 1 })).toEqual({ state: "unavailable", observedAt });
  });
});

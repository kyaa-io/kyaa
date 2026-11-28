import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { readPastDrawArchive } from "@/server/raffle/past-draw-archive";

vi.mock("@/server/wave/access", () => ({ withWaveAccess: (handler: unknown) => handler }));
vi.mock("@/server/raffle/past-draw-archive", () => ({ readPastDrawArchive: vi.fn() }));

const items = Array.from({ length: 13 }, (_, i) => ({
  key: String(i), title: String(i), closesAt: "2026-10-29T00:00:00Z", resultPath: null, image: null,
}));
const get = (query = "") => GET(new Request(`https://dev.kyaa.io/api/raffles/archive${query}`));
beforeEach(() => vi.mocked(readPastDrawArchive).mockResolvedValue(items));

it("returns three recent rounds and lets the full list page through all rounds", async () => {
  expect(await (await get()).json()).toEqual({ items: items.slice(0, 3), hasMore: true });
  expect(await (await get("?page=1")).json()).toEqual({ items: items.slice(0, 12), hasMore: true });
  expect(await (await get("?page=2")).json()).toEqual({ items: items.slice(12), hasMore: false });
});

it("handles invalid pages, empty archives, and source outages", async () => {
  expect((await get("?page=-1")).status).toBe(400);
  vi.mocked(readPastDrawArchive).mockResolvedValueOnce([]);
  expect(await (await get()).json()).toEqual({ items: [], hasMore: false });
  vi.mocked(readPastDrawArchive).mockRejectedValueOnce(new Error("database unavailable"));
  expect((await get()).status).toBe(503);
});

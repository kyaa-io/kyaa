import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc, authorize: async () => ({ appUserId: "a3e1c2d4-0000-4000-8000-000000000001" }) }) }));
import { GET } from "./route";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; rpc.mockReset(); });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });
const request = (method: string, body?: unknown) => new Request("http://localhost/api/chemi/profile", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

it("GET /api/chemi/profile: 404 while CHEMI_TAB is off, then the stored profile", async () => {
  expect((await GET(request("GET"))).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
  process.env.CHEMI_TAB = "true";
  const noSummary = { readingDays: 0, askThreads: 0, partners: 0, orders: 0, askPassesLeft: 0, sajuReading: false, fortuneToday: false, starToday: false };
  rpc.mockImplementation(async (name: string) => name === "chemi_my_birth_summary" ? noSummary : { birth: null, consent: null, partners: [], partnerLimit: 10 });
  const response = await GET(request("GET"));
  expect([response.status, await response.json()]).toEqual([200, { birth: null, consent: null, partners: [], partnerLimit: 10, birthMark: null, summary: noSummary }]);
  expect(rpc).toHaveBeenCalledWith("chemi_read_profile", { p_user: "a3e1c2d4-0000-4000-8000-000000000001" });
});

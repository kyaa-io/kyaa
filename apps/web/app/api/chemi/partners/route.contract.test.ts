import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc, authorize: async () => ({ appUserId: "a3e1c2d4-0000-4000-8000-000000000001" }) }) }));
import { POST, PATCH, DELETE } from "./route";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; rpc.mockReset(); });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });
const request = (method: string, body?: unknown) => new Request("http://localhost/api/chemi/partners", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const partnerId = "b3e1c2d4-0000-4000-8000-000000000002";
it("POST·DELETE /api/chemi/partners: 404 while CHEMI_TAB is off, then add and delete", async () => {
  expect((await POST(request("POST", {}))).status).toBe(404);
  expect((await DELETE(request("DELETE", { partnerId }))).status).toBe(404);
  expect((await PATCH(request("PATCH", {}))).status).toBe(404);
  process.env.CHEMI_TAB = "true";
  rpc.mockResolvedValueOnce({ partnerId });
  const created = await POST(request("POST", { nickname: "민지", birthDate: "1997-03-12", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, source: "saju" }));
  expect([created.status, await created.json()]).toEqual([201, { partnerId }]);
  rpc.mockResolvedValueOnce({ updated: true });
  const updated = await PATCH(request("PATCH", { partnerId, nickname: "민지", birthDate: "1997-03-13", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null }));
  expect([updated.status, await updated.json()]).toEqual([200, { updated: true }]);
  rpc.mockResolvedValueOnce({ deleted: true });
  expect((await DELETE(request("DELETE", { partnerId }))).status).toBe(200);
});

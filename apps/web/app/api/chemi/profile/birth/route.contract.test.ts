import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc, authorize: async () => ({ appUserId: "a3e1c2d4-0000-4000-8000-000000000001" }) }) }));
import { PUT, DELETE } from "./route";

const original = process.env.CHEMI_TAB;
beforeEach(() => { delete process.env.CHEMI_TAB; rpc.mockReset(); });
afterEach(() => { if (original === undefined) delete process.env.CHEMI_TAB; else process.env.CHEMI_TAB = original; });
const request = (method: string, body?: unknown) => new Request("http://localhost/api/chemi/profile/birth", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const birth = { birthDate: "1995-05-05", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: null, birthPlace: null, consent: true };
it("PUT·DELETE /api/chemi/profile/birth: 404 while CHEMI_TAB is off, then save and withdraw", async () => {
  expect((await PUT(request("PUT", birth))).status).toBe(404);
  expect((await DELETE(request("DELETE"))).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
  process.env.CHEMI_TAB = "true";
  rpc.mockResolvedValueOnce({ ageBand: "adult", saved: true, edited: false, editableFrom: null });
  expect(await (await PUT(request("PUT", birth))).json()).toEqual({ ageBand: "adult", edited: false, editableFrom: null });
  rpc.mockResolvedValueOnce({ askThreads: 0, readings: 2, charts: 1, partners: 0, profile: 1, chainRecords: 2 });
  const erased = await DELETE(request("DELETE"));
  expect([erased.status, (await erased.json()).erased.readings]).toEqual([200, 2]);
  expect(rpc).toHaveBeenLastCalledWith("chemi_withdraw_birth_consent", { p_user: "a3e1c2d4-0000-4000-8000-000000000001" });
});

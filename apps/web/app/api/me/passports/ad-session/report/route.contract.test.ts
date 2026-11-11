import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ handler: vi.fn(), rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc: state.rpc, authorize: state.authorize }) }));
vi.mock("@/server/dukjil/claim", () => ({ createClaimHandler: () => ({ adSessionReport: state.handler }) }));
import { POST, dynamic } from "./route";
beforeEach(() => vi.clearAllMocks());
it("forwards the request and preserves the handler response", async () => {
  const request = new Request("https://kyaa.test/api/me/passports/ad-session", { method: "POST", body: "{}" });
  const response = Response.json({ sessionId: "session", status: "pending" }, { status: 201 });
  state.handler.mockResolvedValue(response);
  expect(await POST(request)).toBe(response);
  expect(state.handler).toHaveBeenCalledWith(request);
  expect(dynamic).toBe("force-dynamic");
});
it("maps unexpected handler failures to an API failure", async () => {
  state.handler.mockRejectedValue(new Error("unexpected"));
  const request = new Request("https://kyaa.test/api/me/passports/ad-session", { method: "POST" });
  const response = await POST(request);
  expect(response.status).toBeGreaterThanOrEqual(400);
});

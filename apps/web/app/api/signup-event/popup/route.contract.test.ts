import { beforeEach, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => deps }));
vi.mock("@/server/signup-event/local", () => ({ localSignupEnabled: () => true }));
import { POST } from "./route";

beforeEach(() => vi.resetAllMocks());
it("uses the authenticated member and only shows a successfully claimed notice", async () => {
  deps.authorize.mockResolvedValue({ appUserId: "member" });
  deps.rpc.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const request = new Request("https://kyaa.example/api/signup-event/popup", { method: "POST" });
  expect(await (await POST(request)).json()).toEqual({ show: true });
  expect(await (await POST(request)).json()).toEqual({ show: false });
  expect(deps.rpc).toHaveBeenCalledWith("claim_signup_raffle_popup", expect.objectContaining({ p_user: "member" }));
});

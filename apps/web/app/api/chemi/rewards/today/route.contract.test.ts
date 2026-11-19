import { afterEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const deps = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => deps }));
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const request = () => new Request("https://example.test/api/chemi/rewards/today?p_user=other");

it("claims pending grants only for the signed-in account", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  deps.authorize.mockResolvedValue({ appUserId: "member" });
  deps.rpc.mockResolvedValue({ grants: [] });
  expect(await (await GET(request())).json()).toEqual({ grants: [] });
  expect(deps.rpc).toHaveBeenCalledWith("chemi_rewards_today", { p_user: "member" });
});

it("requires authentication before inspecting grants", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
  expect((await GET(request())).status).toBe(401);
  expect(deps.rpc).not.toHaveBeenCalled();
});

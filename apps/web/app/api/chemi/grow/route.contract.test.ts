import { afterEach, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
vi.mock("server-only", () => ({}));
const deps = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => deps }));
import { GET, POST } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const post = (body: unknown) => new Request("https://example.test/api/chemi/grow", { method: "POST", body: JSON.stringify(body), headers: { origin: "https://example.test", "content-type": "application/json" } });

it("answers 404 while the tab is closed", async () => {
  expect((await GET(new Request("https://example.test/api/chemi/grow"))).status).toBe(404);
  expect(deps.authorize).not.toHaveBeenCalled();
});

it("reads growth only for the signed-in account", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  deps.authorize.mockResolvedValue({ appUserId: "member" });
  deps.rpc.mockResolvedValue({ minis: [] });
  expect(await (await GET(new Request("https://example.test/api/chemi/grow?p_user=other"))).json()).toEqual({ minis: [] });
  expect(deps.rpc).toHaveBeenCalledWith("chemi_grow_state", { p_user: "member" });
});

it("requires sign-in", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
  expect((await GET(new Request("https://example.test/api/chemi/grow"))).status).toBe(401);
  expect(deps.rpc).not.toHaveBeenCalled();
});

it("starts raising one of the three creators and rejects anyone else", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  deps.authorize.mockResolvedValue({ appUserId: "member" });
  deps.rpc.mockResolvedValue({ minis: [] });
  expect((await POST(post({ action: "adopt", character: "yuna" }))).status).toBe(200);
  expect(deps.rpc).toHaveBeenCalledWith("chemi_grow_adopt", { p_user: "member", p_character: "yuna" });
  expect((await POST(post({ action: "adopt", character: "dosa" }))).status).toBe(400);
  expect(deps.rpc).toHaveBeenCalledTimes(1);
});

import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: vi.fn(() => { throw new Error("ENABLED_ENV_REACHED"); }) }));
import { loadServerEnv } from "@/server/config/env";
import { createGroupWalletRouteHandlers } from "./dependencies";
import { groupWalletFailure } from "./routes";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("closes every new wallet handler before auth or data access when groups are disabled", async () => {
 for (const value of [undefined, "false"]) {
  vi.stubEnv("KYAA_GROUPS_ENABLED", value);
  try { createGroupWalletRouteHandlers(); throw new Error("unexpected enabled handler"); }
  catch (error) { const response = groupWalletFailure(error); expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: { code: "GROUP_WALLET_NOT_FOUND" } }); }
 }
 expect(loadServerEnv).not.toHaveBeenCalled();
});
it("keeps dev wallet handlers enabled with the explicit release flag", () => {
 vi.stubEnv("KYAA_GROUPS_ENABLED", "true");
 expect(createGroupWalletRouteHandlers).toThrow("ENABLED_ENV_REACHED");
 expect(loadServerEnv).toHaveBeenCalledOnce();
});

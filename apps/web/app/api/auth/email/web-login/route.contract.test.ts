import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ AUTH_PROVIDER: "cognito" }) }));
vi.mock("@/server/auth/cognito/config", () => ({ emailCognitoConfig: () => ({ origin: "https://kyaa.io" }) }));
import { POST } from "./route";
it("rejects missing or foreign Origin before credentials or storage access", async () => {
  for (const origin of ["", "https://attacker.test"]) {
    const response = await POST(new Request("https://kyaa.io/api/auth/email/web-login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
  }
});

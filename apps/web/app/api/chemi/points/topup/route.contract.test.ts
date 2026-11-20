import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

it("rejects direct production orders before authorization or payment", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("APP_ENV", "production");
  const response = await POST(new Request("https://example.test/api/chemi/points/topup", {
    method: "POST", body: JSON.stringify({ action: "open" })
  }));
  expect(response.status).toBe(404);
});

it.each(["", "false", "1"])("returns 404 in DEV when the flag is %j", async flag => {
  vi.stubEnv("APP_ENV", "dev");
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("CHEMI_TOPUP_ENABLED", flag);
  expect((await POST(new Request("https://example.test", { method: "POST" }))).status).toBe(404);
});

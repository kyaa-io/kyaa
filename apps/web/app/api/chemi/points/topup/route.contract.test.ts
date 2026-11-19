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

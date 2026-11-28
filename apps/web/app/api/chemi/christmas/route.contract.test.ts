import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => { throw Error("closed route accessed dependencies"); },
}));
afterEach(() => vi.unstubAllEnvs());

it("keeps POST /christmas private while the tab is closed", async () => {
  vi.stubEnv("CHEMI_TAB", "false");
  const response = await POST(new Request("http://localhost/api/chemi/christmas"));
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ error: { code: "CHEMI_NOT_FOUND" } });
});

it("opens at midnight KST and includes Christmas Day", async () => {
  const { christmasAvailable } = await import("@/features/chemi/domain/christmas-season");
  for (const [instant, expected] of [
    ["2026-11-30T14:59:59Z", false], ["2026-11-30T15:00:00Z", true],
    ["2026-12-25T14:59:59Z", true], ["2026-12-25T15:00:00Z", false],
  ] as const) expect(christmasAvailable(false, Date.parse(instant))).toBe(expected);
  expect(christmasAvailable(true, Date.parse("2026-11-28"))).toBe(true);
});

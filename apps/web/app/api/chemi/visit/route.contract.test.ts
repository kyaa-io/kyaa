import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => { throw Error("closed route accessed dependencies"); },
}));
afterEach(() => vi.unstubAllEnvs());

it("keeps POST /visit private while the tab is closed", async () => {
  vi.stubEnv("CHEMI_TAB","false");
  const response = await POST(new Request("http://localhost/api/chemi/visit", {method:"POST"}));
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({error:{code:"CHEMI_NOT_FOUND"}});
});

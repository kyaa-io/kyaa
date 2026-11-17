import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc }) }));
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); rpc.mockReset(); });

it("hides participation when there are no readers", async () => {
  vi.stubEnv("CHEMI_TAB", "true");
  rpc.mockResolvedValue(null);
  expect(await (await GET()).json()).toEqual({ participation: null });
  expect(rpc).toHaveBeenCalledWith("chemi_participation", {});
});

it("keeps the closed tab private", async () => {
  vi.stubEnv("CHEMI_TAB", "false");
  expect((await GET()).status).toBe(404);
  expect(rpc).not.toHaveBeenCalled();
});

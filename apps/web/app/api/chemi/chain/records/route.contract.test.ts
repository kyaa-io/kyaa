import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { authorize, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ authorize, rpc }),
}));
import { GET as list } from "./route";
const id = "aaaaaaaa-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHEMI_TAB", "true");
  authorize.mockResolvedValue({ appUserId: id });
});
it("scopes records to the bearer", async () => {
  rpc.mockResolvedValue({ records: [], delayed: false, nextCursor: null });
  const request = new Request("https://local.test/?filter=rank&user=other", {
    headers: { authorization: "Bearer fixture" },
  });
  const response = await list(request);
  expect(response.status).toBe(200);
  expect(authorize).toHaveBeenCalledWith("Bearer fixture");
  expect(rpc).toHaveBeenCalledWith("chemi_chain_read", {
    p_user: id,
    p_filter: "rank",
    p_cursor: null,
    p_id: null,
  });

});

import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { authorize, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ authorize, rpc }),
}));
import { GET } from "./route";
const id = "aaaaaaaa-0000-4000-8000-000000000001";
const context = (value: string) => ({ params: Promise.resolve({ id: value }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHEMI_TAB", "true");
  authorize.mockResolvedValue({ appUserId: id });
});
it("returns 404 when the bearer cannot read the requested record",async()=>{
  rpc.mockResolvedValue({records:[],delayed:false,nextCursor:null});
  expect((await GET(new Request("https://local.test/"),context(id))).status).toBe(404);
  expect(rpc).toHaveBeenCalledWith("chemi_chain_read",{p_user:id,p_id:id,p_cursor:null,p_filter:null});
});

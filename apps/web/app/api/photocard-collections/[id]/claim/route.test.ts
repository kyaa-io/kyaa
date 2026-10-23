import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST, dynamic, runtime } from "./route";

const deps = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => deps }));
const id = "a0000000-0000-4000-8000-000000000001";
const data = { mode: "random_three", ready: true, selectedBundleId: null, options: [], assets: [] };
beforeEach(() => {
  vi.clearAllMocks();
  deps.authorize.mockResolvedValue({ appUserId: "token-owner" });
  deps.rpc.mockResolvedValue(data);
});

it("exposes dynamic Node GET and POST with the same strict response contract", async () => {
  expect(runtime).toBe("nodejs");
  expect(dynamic).toBe("force-dynamic");
  const context = { params: Promise.resolve({ id }) };
  const get = await GET(new Request(`https://kyaa.io/api/photocard-collections/${id}/claim`), context);
  expect(get.status).toBe(200);
  expect(await get.json()).toEqual(data);
  expect(deps.rpc).toHaveBeenNthCalledWith(1, "read_cheer_photocard_claim", { p_app_user_id: "token-owner", p_collection_id: id });
  const post = await POST(new Request(`https://kyaa.io/api/photocard-collections/${id}/claim`, { method: "POST", body: "{}" }), context);
  expect(post.status).toBe(200);
  expect(await post.json()).toEqual(data);
  expect(deps.rpc).toHaveBeenNthCalledWith(2, "claim_cheer_photocard_bundle", { p_app_user_id: "token-owner", p_collection_id: id, p_bundle_id: null });
});

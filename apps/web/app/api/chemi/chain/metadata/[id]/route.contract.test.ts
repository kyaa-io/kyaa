import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { authorize, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/server/fanpage/dependencies", () => ({
  createFanpageDependencies: () => ({ authorize, rpc }),
}));
import { GET as metadata } from "./route";
const id = "aaaaaaaa-0000-4000-8000-000000000001";
const context = (value: string) => ({ params: Promise.resolve({ id: value }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHEMI_TAB", "true");
  authorize.mockResolvedValue({ appUserId: id });
});
it("serializes public ERC-1155 hex IDs and rejects malformed or closed routes", async () => {
  const request = new Request("https://local.test/");
  rpc.mockResolvedValue({
    kind: "album",
    date: "2026-11-19",
    payload: { character: "elina", slot: 1, stage: 5 },
  });
  const result = await metadata(
    request,
    context("0".repeat(32) + id.replaceAll("-", "")),
  );
  expect(rpc).toHaveBeenCalledWith("chemi_chain_metadata", { p_id: id });
  expect(Object.keys(await result.json()).sort()).toEqual([
    "attributes",
    "image",
    "name",
  ]);
  expect((await metadata(request, context("private-name"))).status).toBe(404);
  vi.stubEnv("CHEMI_TAB", "false");
  expect((await metadata(request,context(id))).status).toBe(404);
  expect(authorize).not.toHaveBeenCalled();
});

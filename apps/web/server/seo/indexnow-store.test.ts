import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createIndexNowStore } from "./indexnow-store";

it("checks RPC errors, structured claims and fenced acknowledgements", async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data: { acquired: false }, error: null })
    .mockResolvedValueOnce({ data: { acquired: true, snapshot: {} }, error: null })
    .mockResolvedValueOnce({ data: false, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  const store = createIndexNowStore({ rpc });
  expect(await store.claim("token")).toBeNull();
  expect(await store.claim("token")).toEqual({});
  expect(await store.acknowledge("token", {})).toBe(false);
  await store.release("token");
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["claim_search_indexnow", "claim_search_indexnow", "acknowledge_search_indexnow", "release_search_indexnow"]);
  rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  await expect(store.claim("token")).rejects.toThrow("INDEXNOW_STORE_UNAVAILABLE");
  await expect(store.acknowledge("token", {})).rejects.toThrow("INDEXNOW_STORE_UNAVAILABLE");
  await expect(store.release("token")).rejects.toThrow("INDEXNOW_STORE_UNAVAILABLE");
});

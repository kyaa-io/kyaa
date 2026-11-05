import { describe, expect, it } from "vitest";
import { assertRpcChainId } from "../src/runtime.js";

const env = { GIWA_RPC_URL: "http://127.0.0.1:1", GIWA_CHAIN_ID: 91342 as const };
type ChainEnv = Parameters<typeof assertRpcChainId>[0];
describe("RPC chain id boundary", () => {
  it("accepts an RPC that reports 91342", async () => {
    await expect(assertRpcChainId(env as ChainEnv, { getChainId: async () => 91342 })).resolves.toBeUndefined();
  });
  it.each([1, 91341, 0])("refuses an RPC reporting %i", async (id) => {
    await expect(assertRpcChainId(env as ChainEnv, { getChainId: async () => id })).rejects.toThrow(/91342/);
  });
  it("refuses when the configured id is not 91342", async () => {
    await expect(assertRpcChainId({ ...env, GIWA_CHAIN_ID: 1 } as unknown as ChainEnv, { getChainId: async () => 91342 })).rejects.toThrow(/91342/);
  });
});

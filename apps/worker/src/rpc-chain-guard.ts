import { createPublicClient, http } from "viem";

export const TESTNET_CHAIN_ID = 91342;

/** Testnet-only boundary: the RPC at `rpcUrl` must report 91342 (and the configured id must be 91342) before any signing path is built. */
export async function assertRpcUrlChainId(rpcUrl: string, configuredChainId: number, client?: { getChainId(): Promise<number> }): Promise<void> {
  const reader = client ?? createPublicClient({ transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }) });
  const actual = await reader.getChainId();
  if (actual !== TESTNET_CHAIN_ID || configuredChainId !== TESTNET_CHAIN_ID) throw new Error("GIWA RPC chain id must be 91342 (testnet only)");
}

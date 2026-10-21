import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "../src/env.js";

const state = vi.hoisted(() => ({ createQueue: vi.fn(), run: vi.fn(), participation: vi.fn(), action: vi.fn(), finality: vi.fn() }));

vi.mock("../src/adapters/supabase-queue.js", () => ({
  SupabaseQueueAdapter: { create: state.createQueue },
}));
vi.mock("../src/participation-runtime.js", () => ({ runParticipationOnce: state.participation }));
vi.mock("../src/adapters/pinata.js", () => ({ PinataMetadataAdapter: class {} }));
vi.mock("../src/adapters/viem-chain.js", () => ({ ViemChainAdapter: class {} }));
vi.mock("../src/worker.js", () => ({ MintWorker: class { runOnce = state.run; } }));

vi.mock("../src/action-worker.js", () => ({ ActionWorker: class { runOnce = state.action; } }));
vi.mock("../src/adapters/supabase-action-queue.js", () => ({ SupabaseActionQueueAdapter: { create: () => ({}) } }));
vi.mock("../src/adapters/viem-action-hub.js", () => ({ ViemActionHubAdapter: class {} }));
vi.mock("../src/action-finality.js", () => ({
  ActionFinalityReconciler: class { runOnce = state.finality; },
  SupabaseActionReceiptIndex: { create: () => ({}) }, ViemActionFinalityReader: class {},
}));

import { runWorkerOnce } from "../src/runtime.js";

const env = {
  WORKER_CAPABILITY_VERSION: "v1",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
  PINATA_API_URL: "https://api.pinata.cloud",
  PINATA_JWT: "y".repeat(40),
  GIWA_RPC_URL: "https://rpc.testnet.giwa.io",
  GIWA_CHAIN_ID: 91342,
  GIWA_RELAYER_PRIVATE_KEY: `0x${"1".repeat(64)}`,
  BYUS_PASSPORT_CONTRACT_ADDRESS: `0x${"2".repeat(40)}`,
  BYUS_STAMP_CONTRACT_ADDRESS: `0x${"3".repeat(40)}`,
  GIWA_DEPLOYMENT_BLOCK: 1n,
  GIWA_MINT_MAX_GAS: 1_000_000n,
  GIWA_MINT_MAX_FEE_PER_GAS_WEI: 100_000_000n,
  GIWA_MINT_MAX_PRIORITY_FEE_PER_GAS_WEI: 100_000_000n,
  GIWA_MINT_MAX_EXECUTION_FEE_WEI: 100_000_000_000_000n,
  WORKER_ID: "worker-test",
  WORKER_BATCH_SIZE: 5,
  WORKER_LEASE_SECONDS: 120,
  WORKER_POLL_INTERVAL_MS: 5_000,
  WORKER_RECEIPT_POLL_ATTEMPTS: 24,
  METADATA_ASSET_BASE_URI: "ipfs://bafyassets/v1",
  WORKER_ENABLED: true,
  PARTICIPATION_LEDGER_ENABLED: false,
} satisfies WorkerEnv;

describe("mint worker capability", () => {
  beforeEach(() => {
    state.createQueue.mockReset().mockReturnValue({});
    state.run.mockReset().mockResolvedValue(0);
    state.participation.mockReset().mockResolvedValue(0);
    state.action.mockReset().mockResolvedValue(0);
    state.finality.mockReset().mockResolvedValue(0);
  });

  it("continues legacy claims after participation failure and still reports the failed invocation", async () => {
    state.participation.mockRejectedValue(new Error("RPC unavailable"));
    await expect(runWorkerOnce(env)).rejects.toThrow("Participation worker failed");
    expect(state.run).toHaveBeenCalledOnce();
  });

  it("also continues ActionHub claims and finality after participation failure", async () => {
    state.participation.mockRejectedValue(new Error("RPC unavailable"));
    await expect(runWorkerOnce({ ...env, WORKER_CAPABILITY_VERSION: "action-ledger-v1" })).rejects.toThrow("Participation worker failed");
    expect(state.run).toHaveBeenCalledOnce(); expect(state.action).toHaveBeenCalledOnce();
    expect(state.finality).toHaveBeenCalledOnce();
  });

  it("keeps the default worker away from community stamp jobs", async () => {
    await runWorkerOnce(env);
    expect(state.createQueue).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, ["passport", "stamp", "reaction"]);
  });

  it("claims community stamps only with the explicit capability version", async () => {
    await runWorkerOnce({ ...env, WORKER_CAPABILITY_VERSION: "community-stamp-v1" });
    expect(state.createQueue).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, ["passport", "stamp", "reaction", "community_stamp"]);
  });

  it("preserves Collectible claims when community stamps are enabled", async () => {
    await runWorkerOnce({
      ...env,
      WORKER_CAPABILITY_VERSION: "community-stamp-v1",
      BYUS_COLLECTIBLE_CONTRACT_ADDRESS: `0x${"4".repeat(40)}`,
      GIWA_COLLECTIBLE_DEPLOYMENT_BLOCK: 10n,
    });
    expect(state.createQueue).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, [
      "passport", "stamp", "reaction", "collectible", "community_stamp",
    ]);
  });
});

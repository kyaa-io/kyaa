import { BaseError, type Address, type Hash, type Hex, type PublicClient } from "viem";
import type { WorkerEnv } from "./env.js";
import { SupabaseParticipationQueue } from "./adapters/supabase-participation.js";
import { ViemParticipationAdapter } from "./adapters/viem-participation.js";
import { ParticipationWorker } from "./participation-worker.js";
import { participationAbi } from "./participation-domain.js";
export async function runParticipationOnce(env: WorkerEnv, workerId: string): Promise<number> {
  if (!env.PARTICIPATION_LEDGER_ENABLED) return 0;
  try {
  const queue = SupabaseParticipationQueue.create(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const chain = new ViemParticipationAdapter({ rpcUrl: env.PARTICIPATION_LEDGER_RPC_URL ?? env.GIWA_RPC_URL, chainId: env.GIWA_CHAIN_ID, privateKey: env.GIWA_RELAYER_PRIVATE_KEY as Hex, contractAddress: env.BYUS_PARTICIPATION_LEDGER_CONTRACT_ADDRESS as Address, feePolicy: { maxGas: 4_000_000n, maxFeePerGasWei: env.GIWA_MINT_MAX_FEE_PER_GAS_WEI, maxPriorityFeePerGasWei: env.GIWA_MINT_MAX_PRIORITY_FEE_PER_GAS_WEI, maxExecutionFeeWei: env.GIWA_MINT_MAX_EXECUTION_FEE_WEI } });
  await queue.rpc("reconcile_participation_sources", { p_limit: 100 });
  const claimed = await new ParticipationWorker(queue, chain, { workerId, batchSize: 1, leaseSeconds: env.WORKER_LEASE_SECONDS }).runOnce();
  const targets = await queue.rpc("list_participation_count_targets", {}) as { slug: string; creator: Hash; day: string; scope: string }[];
  const { block, counts, finality, finalizedBlockNumber, safeBlockNumber, observedAt } = await readParticipationCounts(chain.client, env.BYUS_PARTICIPATION_LEDGER_CONTRACT_ADDRESS as Address, targets);
  await queue.rpc("store_participation_count_snapshot", { p_contract_address: env.BYUS_PARTICIPATION_LEDGER_CONTRACT_ADDRESS!.toLowerCase(), p_block_number: block.number.toString(), p_block_hash: block.hash, p_observed_at: observedAt, p_counts: counts, p_finality: finality, p_finalized_block_number: finalizedBlockNumber?.toString() ?? null });
  for (const stored of await queue.receipts(20)) {
    const status = await chain.finality(stored.receipt, { safe: safeBlockNumber, finalized: finalizedBlockNumber });
    await queue.setFinality(stored.id, stored.receipt, status);
    if (status === "orphaned") {
      const canonical = await chain.receipt(stored.payload, stored.submission);
      if (canonical) await queue.rpc("replace_participation_receipt", { p_job_id: stored.id, p_expected_block_hash: stored.receipt.blockHash, p_receipt: canonical });
    }
  }
  return claimed;
  } catch (error) {
    if (error instanceof BaseError) throw new Error("Participation RPC observation failed");
    throw error;
  }
}

export async function readParticipationCounts(client: PublicClient, address: Address, targets: { slug: string; creator: Hash; day: string; scope: string }[]) {
  const block = await client.getBlock({ blockTag: "latest" });
  if (block.number === null || block.hash === null) throw new Error("Participation block unavailable");
  const [safe, finalized] = await Promise.all(["safe", "finalized"].map(blockTag => client.getBlock({ blockTag: blockTag as "safe" | "finalized" }).then(head => head.number).catch(() => null)));
  const observedAt = new Date().toISOString();
  const counts = await Promise.all(targets.map(async target => {
    const value = await client.readContract({ address, abi: participationAbi, functionName: "counts", args: [target.creator, BigInt(target.day)], blockNumber: block.number });
    return { slug: target.slug, scope: target.scope, ...Object.fromEntries(Object.entries(value).map(([key, count]) => {
      if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Participation count exceeds display precision");
      return [key, Number(count)];
    })) };
  }));
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error("Participation block changed while reading counts");
  const finality = finalized != null && finalized >= block.number ? "finalized" : safe != null && safe >= block.number ? "safe" : "included";
  return { block, counts, finality, finalizedBlockNumber: finalized ?? null, safeBlockNumber: safe ?? null, observedAt };
}

import { describe, it, expect, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { BaseError, ResourceNotFoundRpcError, encodeFunctionData, keccak256, type PublicClient } from "viem";
import { ParticipationWorker } from "../src/participation-worker.js";
import { ViemParticipationAdapter } from "../src/adapters/viem-participation.js";
import { ParticipationRevertedError, participationAbi, participationPayloadSchema, type ParticipationJob, type ParticipationQueue, type ParticipationChain } from "../src/participation-domain.js";
const hash = `0x${"11".repeat(32)}` as `0x${string}`;
const key = `0x${"01".repeat(32)}` as const;
const contractAddress = "0x2222222222222222222222222222222222222222";
const payload = participationPayloadSchema.parse({ version: 1, chainId: 91342, contractAddress, items: [{ source: hash, creator: hash, participant: hash, occurredAtMicros: "1234567", revision: "1", kind: 4, origin: 0, active: true }] });
const receipt = { txHash: hash, blockHash: hash, blockNumber: "1", transactionIndex: 0, inclusionStatus: "included" as const };
function harness() {
  let job: ParticipationJob = { id: "job", leaseOwner: "worker", relayer: contractAddress, chainId: 91342, contractAddress, items: payload.items, payload, txHash: null, signedTransaction: null };
  const queue: ParticipationQueue = { claim: vi.fn(async () => [job]), freeze: vi.fn(async () => job), writer: vi.fn(async () => true), release: vi.fn(async () => {}), admit: vi.fn(async () => true), prepared: vi.fn(async (_job, submission) => { job = { ...job, ...submission }; return job; }), complete: vi.fn(async () => {}), failReverted: vi.fn(async () => {}), retry: vi.fn(async () => {}) };
  const chain: ParticipationChain = { relayerAddress: contractAddress, prepare: vi.fn(async () => ({ txHash: hash, signedTransaction: "0x1234" })), broadcast: vi.fn(async () => hash), receipt: vi.fn(async () => null) };
  const worker = new ParticipationWorker(queue, chain, { workerId: "worker", batchSize: 1, leaseSeconds: 120 }, { sleep: vi.fn(async () => {}) });
  return { queue, chain, worker, setJob: (value: Partial<ParticipationJob>) => { job = { ...job, ...value }; } };
}
describe("participation durable dispatch", () => {
  it("terminates only a verified finalized revert without acknowledging or resigning", async () => {
    const { setJob, queue, chain, worker } = harness();
    setJob({ txHash: hash, signedTransaction: "0x1234" });
    const failure = { ...receipt, outcome: "reverted" as const, inclusionStatus: "finalized" as const };
    vi.mocked(chain.receipt).mockRejectedValue(new ParticipationRevertedError(failure));
    await worker.runOnce();
    expect(queue.failReverted).toHaveBeenCalledWith(expect.anything(), failure);
    expect(queue.complete).not.toHaveBeenCalled(); expect(queue.retry).not.toHaveBeenCalled();
    expect(chain.prepare).not.toHaveBeenCalled(); expect(chain.broadcast).not.toHaveBeenCalled();
  });
  it("persists signed bytes before broadcast and retries the same submission after response loss", async () => {
    const { queue, chain, worker } = harness();
    vi.mocked(chain.broadcast).mockRejectedValueOnce(new Error("response lost"));
    await worker.runOnce(); await worker.runOnce();
    expect(chain.prepare).toHaveBeenCalledTimes(1);
    expect(chain.broadcast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(queue.prepared).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(chain.broadcast).mock.invocationCallOrder[0]!);
    expect(queue.retry).toHaveBeenCalled();
  });
  it("does not persist RPC credentials or request payloads in retry errors", async () => {
    const { chain, queue, worker } = harness();
    vi.mocked(chain.broadcast).mockRejectedValue(new BaseError("request failed", { details: "https://rpc.example/private-key signed payload" }));
    await worker.runOnce();
    expect(queue.retry).toHaveBeenCalledWith(expect.anything(), "PARTICIPATION_RPC_UNAVAILABLE", "Participation RPC request failed; retrying the persisted batch");
  });
  it("recovers an included duplicate without preparing a new nonce", async () => {
    const { setJob, chain, queue, worker } = harness();
    setJob({ txHash: hash, signedTransaction: "0x1234" }); vi.mocked(chain.receipt).mockResolvedValue(receipt);
    await worker.runOnce(); expect(chain.prepare).not.toHaveBeenCalled(); expect(queue.complete).toHaveBeenCalledWith(expect.anything(), receipt);
  });
  it("stale lease after persistence cannot broadcast", async () => {
    const { chain, queue, worker } = harness(); vi.mocked(queue.admit).mockResolvedValue(false);
    await worker.runOnce(); expect(chain.broadcast).not.toHaveBeenCalled(); expect(queue.release).toHaveBeenCalled();
  });
  it("polls a freshly broadcast receipt within the bounded invocation", async () => {
    const { chain, queue, worker } = harness();
    vi.mocked(chain.receipt).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);
    await worker.runOnce();
    expect(chain.receipt).toHaveBeenCalledTimes(3);
    expect(queue.complete).toHaveBeenCalledWith(expect.anything(), receipt);
    expect(queue.retry).not.toHaveBeenCalled();
  });
  it("limits receipt polling to five short waits", async () => {
    const { chain, queue, worker } = harness();
    await worker.runOnce();
    expect(chain.receipt).toHaveBeenCalledTimes(6);
    expect(queue.retry).toHaveBeenCalledWith(expect.anything(), "PARTICIPATION_PENDING", expect.any(String));
  });
  it("partial persisted transaction fails closed", async () => {
    const { setJob, chain, queue, worker } = harness(); setJob({ txHash: hash });
    await worker.runOnce(); expect(chain.prepare).not.toHaveBeenCalled(); expect(queue.retry).toHaveBeenCalledWith(expect.anything(), "PARTICIPATION_PARTIAL_SUBMISSION", expect.any(String));
  });
});
describe("participation chain proof", () => {
  it("releases only a canonical finalized revert and never checks successful contract state", async () => {
    const account = privateKeyToAccount(key);
    const data = encodeFunctionData({ abi: participationAbi, functionName: "record", args: [[{ ...payload.items[0]!, source: hash, creator: hash, participant: hash, occurredAtMicros: 1234567n, revision: 1n }]] });
    const signedTransaction = await account.signTransaction({ type: "eip1559", chainId: 91342, to: contractAddress, value: 0n, data, nonce: 0, gas: 900000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n });
    const submission = { signedTransaction, txHash: keccak256(signedTransaction) };
    let finalized = 0n, canonical = hash;
    const client = {
      getTransactionReceipt: vi.fn(async () => ({ transactionHash: submission.txHash, status: "reverted", blockHash: hash, blockNumber: 1n, transactionIndex: 0 })),
      getTransaction: vi.fn(async () => ({ hash: keccak256(signedTransaction), from: account.address, to: contractAddress, chainId: 91342, value: 0n, input: data, blockHash: hash, blockNumber: 1n })),
      getBlock: vi.fn(async ({ blockTag }: { blockTag?: string }) => ({ number: blockTag ? finalized : 1n, hash: canonical })),
      readContract: vi.fn(),
    };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.receipt(payload, submission)).resolves.toBeNull();
    finalized = 1n;
    await expect(chain.receipt(payload, submission)).rejects.toMatchObject({ receipt: { txHash: submission.txHash, outcome: "reverted", inclusionStatus: "finalized" } });
    canonical = `0x${"22".repeat(32)}`;
    await expect(chain.receipt(payload, submission)).rejects.toThrow("not canonical");
    canonical = hash;
    client.getTransaction.mockResolvedValueOnce({ hash: submission.txHash, from: account.address, to: contractAddress, chainId: 91342, value: 1n, input: data, blockHash: hash, blockNumber: 1n });
    await expect(chain.receipt(payload, submission)).rejects.toThrow("canonical transaction mismatch");
    client.getTransactionReceipt.mockResolvedValueOnce({ transactionHash: hash, status: "reverted", blockHash: hash, blockNumber: 1n, transactionIndex: 0 });
    await expect(chain.receipt(payload, submission)).rejects.toThrow("canonical transaction mismatch");
    client.getTransactionReceipt.mockResolvedValueOnce({ transactionHash: submission.txHash, status: "unknown", blockHash: hash, blockNumber: 1n, transactionIndex: 0 });
    await expect(chain.receipt(payload, submission)).rejects.toThrow("canonical transaction mismatch");
    client.getTransaction.mockResolvedValueOnce({ hash, from: account.address, to: contractAddress, chainId: 91342, value: 0n, input: data, blockHash: hash, blockNumber: 1n });
    await expect(chain.receipt(payload, submission)).rejects.toThrow("canonical transaction mismatch");
    client.getBlock.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(chain.receipt(payload, submission)).rejects.toThrow("RPC unavailable");
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("rejects signed calldata unrelated to frozen batch before broadcasting", async () => {
    const account = privateKeyToAccount(key);
    const signedTransaction = await account.signTransaction({ type: "eip1559", chainId: 91342, to: contractAddress, value: 0n, data: "0x1234", nonce: 0, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n });
    const client = { sendRawTransaction: vi.fn() };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.broadcast(payload, { signedTransaction, txHash: keccak256(signedTransaction) })).rejects.toThrow("envelope mismatch");
    expect(client.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("waits for freshly included block state without acknowledging an unverified receipt", async () => {
    const account = privateKeyToAccount(key);
    const data = encodeFunctionData({ abi: participationAbi, functionName: "record", args: [[{ ...payload.items[0]!, source: hash, creator: hash, participant: hash, occurredAtMicros: 1234567n, revision: 1n }]] });
    const signedTransaction = await account.signTransaction({ type: "eip1559", chainId: 91342, to: contractAddress, value: 0n, data, nonce: 0, gas: 900000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n });
    const client = {
      getTransactionReceipt: vi.fn(async () => ({ transactionHash: keccak256(signedTransaction), status: "success", blockHash: hash, blockNumber: 1n })),
      getTransaction: vi.fn(async () => ({ hash: keccak256(signedTransaction), from: account.address, to: contractAddress, chainId: 91342, value: 0n, input: data, blockHash: hash, blockNumber: 1n })),
      readContract: vi.fn().mockRejectedValue(new ResourceNotFoundRpcError(new Error("state unavailable"))),
    };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.receipt(payload, { signedTransaction, txHash: keccak256(signedTransaction) })).resolves.toBeNull();
  });
  it("marks a receipt orphaned when its canonical block changes", async () => {
    const client = { getTransactionReceipt: vi.fn(async () => ({ status: "success", blockHash: hash, blockNumber: 1n })), getBlock: vi.fn(async () => ({ hash: `0x${"22".repeat(32)}` })) };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.finality(receipt)).resolves.toBe("orphaned");
  });
  it("reuses observed heads while still checking canonical receipt and block", async () => {
    const client = { getTransactionReceipt: vi.fn(async () => ({ status: "success", blockHash: hash, blockNumber: 1n })), getBlock: vi.fn(async () => ({ hash })) };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.finality(receipt, { safe: 2n, finalized: 1n })).resolves.toBe("finalized");
    expect(client.getBlock).toHaveBeenCalledExactlyOnceWith({ blockNumber: 1n });
    client.getBlock.mockResolvedValue({ hash: `0x${"22".repeat(32)}` });
    await expect(chain.finality(receipt, { safe: 2n, finalized: 1n })).resolves.toBe("orphaned");
  });
  it("reports only included if safe/finalized RPC tags are unavailable", async () => {
    const client = { getTransactionReceipt: vi.fn(async () => ({ status: "success", blockHash: hash, blockNumber: 1n })), getBlock: vi.fn(async ({ blockTag }: { blockTag?: string }) => { if (blockTag) throw new Error("unsupported"); return { hash }; }) };
    const chain = new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: client as unknown as PublicClient });
    await expect(chain.finality(receipt)).resolves.toBe("included");
  });
});

describe("canonical count snapshot", () => {
  const targets = [{ slug: "a", creator: hash, day: "0", scope: "all" }, { slug: "a", creator: hash, day: "1", scope: "event-day" }];
  function clientWithHeads(finalized = 8n, safe = 9n) {
    return { getBlock: vi.fn(async ({ blockTag }: { blockTag?: string }) => ({ number: blockTag === "finalized" ? finalized : blockTag === "safe" ? safe : 10n, hash })), readContract: vi.fn(async () => ({ reservations: BigInt(Number.MAX_SAFE_INTEGER), passports: 1n, likes: 2n, comments: 3n, engagedFans: 4n })) };
  }
  it("reads every target at one latest canonical block with exact safe integers and honest inclusion", async () => {
    const { readParticipationCounts } = await import("../src/participation-runtime.js");
    const client = clientWithHeads();
    const result = await readParticipationCounts(client as unknown as PublicClient, contractAddress, targets);
    expect(result.counts[0]).toMatchObject({ reservations: Number.MAX_SAFE_INTEGER });
    expect(result).toMatchObject({ finality: "included", finalizedBlockNumber: 8n });
    expect(client.getBlock).toHaveBeenNthCalledWith(1, { blockTag: "latest" });
    for (const [args] of client.readContract.mock.calls as unknown as [{ blockNumber: bigint }][]) expect(args.blockNumber).toBe(10n);
  });
  it("rejects a count exceeding safe integer precision", async () => {
    const { readParticipationCounts } = await import("../src/participation-runtime.js");
    const client = clientWithHeads(); client.readContract.mockResolvedValue({ reservations: BigInt(Number.MAX_SAFE_INTEGER) + 1n, passports: 0n, likes: 0n, comments: 0n, engagedFans: 0n });
    await expect(readParticipationCounts(client as unknown as PublicClient, contractAddress, targets)).rejects.toThrow("display precision");
  });
  it.each([[8n, 10n, "safe"], [10n, 10n, "finalized"]])("reports observed finality for finalized %s safe %s", async (finalized, safe, expected) => {
    const { readParticipationCounts } = await import("../src/participation-runtime.js");
    expect((await readParticipationCounts(clientWithHeads(finalized as bigint, safe as bigint) as unknown as PublicClient, contractAddress, targets)).finality).toBe(expected);
  });
  it("rejects a changed canonical block before publishing", async () => {
    const { readParticipationCounts } = await import("../src/participation-runtime.js");
    const client = clientWithHeads();
    client.getBlock.mockImplementation(async (args) => ({ number: 10n, hash: args.blockTag ? hash : "changed" as typeof hash }));
    await expect(readParticipationCounts(client as unknown as PublicClient, contractAddress, targets)).rejects.toThrow("block changed");
  });
});

describe("source revision acknowledgement", () => {
  const make = (state: unknown) => new ViemParticipationAdapter({ rpcUrl: "https://example.com", chainId: 91342, contractAddress, privateKey: key, client: { readContract: vi.fn(async () => state) } as unknown as PublicClient });
  it("rejects a mismatched source identity and same revision active conflict", async () => {
    await expect(make([hash, hash, hash, 1234567n, 1n, 4, 0, false]).assertState(payload, 1n)).rejects.toThrow("does not acknowledge");
    await expect(make([hash, hash, `0x${"22".repeat(32)}`, 1234567n, 2n, 4, 0, true]).assertState(payload, 1n)).rejects.toThrow("does not acknowledge");
  });
  it("accepts a newer revision for immutable source identity", async () => {
    await expect(make([hash, hash, hash, 1234567n, 2n, 4, 0, false]).assertState(payload, 1n)).resolves.toBeUndefined();
  });
});

describe("participation pending retry delay", () => {
  it("uses two seconds for pending inclusion and sixty for actual failures", async () => {
    const { SupabaseParticipationQueue } = await import("../src/adapters/supabase-participation.js");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const queue = new SupabaseParticipationQueue({ rpc } as unknown as import("@supabase/supabase-js").SupabaseClient);
    const job = { id: "job", leaseOwner: "worker" } as ParticipationJob;
    await queue.retry(job, "PARTICIPATION_PENDING", "pending");
    await queue.retry(job, "RPC_FAILURE", "failure");
    expect(rpc).toHaveBeenNthCalledWith(1, "retry_participation_batch", expect.objectContaining({ p_retry_seconds: 2 }));
    expect(rpc).toHaveBeenNthCalledWith(2, "retry_participation_batch", expect.objectContaining({ p_retry_seconds: 60 }));
  });
});

import { BaseError, BlockNotFoundError, ContractFunctionZeroDataError, decodeFunctionData, parseTransaction, TransactionReceiptNotFoundError, type PublicClient } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionHubAbi, ViemActionHubAdapter } from "../src/adapters/viem-action-hub.js";
import type { CanonicalActionPayloadV1 } from "../src/action-domain.js";

const h = (v: string) => `0x${v.repeat(64)}`.slice(0, 66);
const address = (v: string) => `0x${v.repeat(40)}`.slice(0, 42);
const privateKey = `0x${"1".repeat(64)}` as `0x${string}`;
const hub = address("2") as `0x${string}`; const environment = h("3"); const schema = h("4"); const nft = address("5");
const payload: CanonicalActionPayloadV1 = {
  version: 1, chainId: 91342, environmentId: environment, hubProxy: hub, schemaUid: schema, operation: 1,
  request: { sourceOccurrence: h("6"), revision: 1, actionCode: 3, schemaVersion: 1, policyVersion: 1, fan: address("7"), creatorId: h("8"), campaignId: h("9"), occurredDay: 20_000, evidenceCommitment: h("a"), migrationBatchId: h("0"), bindingVersion: 1 },
  occurrenceId: h("b"), actionId: h("c"), requestHash: h("d"), migrationProof: [],
  intents: [{ kind: 1, mode: 0, nftContract: nft, issuanceKey: h("e"), tokenId: "0", metadataUri: "ipfs://attendance" }],
};

function adapter(client: Record<string, unknown>) {
  return new ViemActionHubAdapter({ rpcUrl: "http://localhost:8545", chainId: 91342, privateKey, hubAddress: hub, deploymentBlock: 1n, client: client as unknown as PublicClient });
}

describe("ViemActionHubAdapter signed request integrity", () => {
  it("signs the exact canonical request and rejects field mutation before receipt lookup", async () => {
    const client = {
      readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === "environmentId") return environment;
        if (functionName === "getSchema") return schema;
        if (functionName === "getAssetBinding") return nft;
        throw new Error(`unexpected ${functionName}`);
      }),
      getTransactionCount: vi.fn().mockResolvedValue(4), estimateGas: vi.fn().mockResolvedValue(300_000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
      getTransactionReceipt: vi.fn(),
    };
    const chain = adapter(client);
    const submission = await chain.prepare(payload);
    const transaction = parseTransaction(submission.signedTransaction as Parameters<typeof parseTransaction>[0]);
    const decoded = decodeFunctionData({ abi: actionHubAbi, data: transaction.data! });
    expect(decoded.functionName).toBe("recordAndIssue");
    expect((decoded.args?.[0] as { actionCode: number }).actionCode).toBe(3);
    expect(decoded.args?.[1]).toHaveLength(1);

    await expect(chain.receipt({ ...payload, request: { ...payload.request, campaignId: h("f") } }, submission)).rejects.toMatchObject({ code: "PREPARED_ACTION_TRANSACTION_MISMATCH", retryable: false });
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
    client.getTransactionReceipt.mockRejectedValue(new TransactionReceiptNotFoundError({ hash: submission.txHash as `0x${string}` }));
    await expect(chain.receipt(payload, submission)).resolves.toBeNull();
  });
});

describe("ViemActionHubAdapter transient read retries", () => {
  afterEach(() => vi.useRealTimers());

  it.each([undefined, 123n])("retries nested zero-data errors with the same request at block %s", async (blockNumber) => {
    vi.useFakeTimers();
    const error = new BaseError("contract call failed", { cause: new ContractFunctionZeroDataError({ functionName: "getAction" }) });
    const record = { status: 2, actionId: payload.actionId };
    const readContract = vi.fn().mockRejectedValueOnce(error).mockRejectedValueOnce(error).mockResolvedValue(record);
    const chain = adapter({ readContract });
    const result = chain["getAction"](payload.actionId as `0x${string}`, blockNumber);
    await vi.advanceTimersByTimeAsync(200);
    await expect(result).resolves.toBe(record);
    expect(readContract).toHaveBeenCalledTimes(3);
    for (const [request] of readContract.mock.calls) {
      expect(request).toEqual({ address: hub, abi: actionHubAbi, functionName: "getAction", args: [payload.actionId], blockNumber });
    }
  });

  it("throws the original persistent zero-data error after three reads instead of treating it as absent", async () => {
    vi.useFakeTimers();
    const error = new ContractFunctionZeroDataError({ functionName: "getAction" });
    const readContract = vi.fn().mockRejectedValue(error);
    const result = expect(adapter({ readContract }).findExisting(payload)).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(200);
    await result;
    expect(readContract).toHaveBeenCalledTimes(3);
  });

  it.each([1, 2, 3, 4])("retries transient block lookup %s without changing its request or skipping receipt validation", async (failedCall) => {
    vi.useFakeTimers();
    const error = new BaseError("RPC block lookup failed", { cause: new BlockNotFoundError({ blockNumber: 123n }) });
    const blockHash = h("f");
    const receipt = { blockNumber: 123n, blockHash, status: "reverted", logs: [] };
    const getBlock = vi.fn().mockImplementation(async (request: { blockNumber?: bigint }) => {
      if (getBlock.mock.calls.length === failedCall) throw error;
      return { number: request.blockNumber ?? 200n, hash: blockHash };
    });
    const chain = adapter({ getTransactionReceipt: vi.fn().mockResolvedValue(receipt), getBlock });
    const result = expect(chain["validateReceipt"](h("e") as `0x${string}`, payload)).rejects.toMatchObject({ code: "GIWA_ACTION_TRANSACTION_REVERTED" });
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(getBlock).toHaveBeenCalledTimes(5);
    const failedRequest = getBlock.mock.calls[failedCall - 1]?.[0];
    const matchingRequests = getBlock.mock.calls.filter(([request]) => request.blockNumber === failedRequest?.blockNumber && request.blockTag === failedRequest?.blockTag);
    expect(matchingRequests.length).toBeGreaterThanOrEqual(2);
    for (const [request] of getBlock.mock.calls) expect([{ blockTag: "latest" }, { blockNumber: 123n }, { blockNumber: 200n }]).toContainEqual(request);
  });

  it("throws the original persistent block error after three identical lookups", async () => {
    vi.useFakeTimers();
    const error = new BlockNotFoundError({ blockNumber: 123n });
    const getBlock = vi.fn().mockRejectedValue(error);
    const chain = adapter({ getTransactionReceipt: vi.fn().mockResolvedValue({ blockNumber: 123n }), getBlock });
    const result = expect(chain["validateReceipt"](h("e") as `0x${string}`, payload)).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(200);
    await result;
    expect(getBlock).toHaveBeenCalledTimes(6);
    expect(getBlock.mock.calls.filter(([request]) => request.blockTag === "latest")).toHaveLength(3);
    expect(getBlock.mock.calls.filter(([request]) => request.blockNumber === 123n)).toHaveLength(3);
  });

  it.each([
    new Error("getAction returned 0x"),
    new BaseError("contract reverted", { cause: new Error("execution reverted") }),
  ])("does not retry unrelated errors: %s", async (error) => {
    const readContract = vi.fn().mockRejectedValue(error);
    await expect(adapter({ readContract }).findExisting(payload)).rejects.toBe(error);
    expect(readContract).toHaveBeenCalledOnce();
  });
});

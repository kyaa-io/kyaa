import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, getAddress, keccak256, parseTransaction, type Address, type Hash, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ViemChainAdapter } from "../src/adapters/viem-chain.js";
import type { CommunityStampPayloadV1, JobPayload, PassportPayloadV1, PreparedSubmission, ReactionPayloadV1, StampPayloadV1 } from "../src/domain.js";

const privateKey = `0x${"1".repeat(64)}` as Hex;
const passportAddress = `0x${"2".repeat(40)}` as Address;
const stampAddress = `0x${"3".repeat(40)}` as Address;
const directStampAddress = getAddress("0x527a70c0f7cf129650dc282b709327c5958a4ccf");
const collectibleAddress = `0x${"4".repeat(40)}` as Address;
const recipient = `0x${"5".repeat(40)}` as Address;
const otherRecipient = `0x${"6".repeat(40)}` as Address;
const passportId = `0x${"7".repeat(64)}` as Hash;
const issuanceId = `0x${"8".repeat(64)}` as Hash;

const passportMintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "passportId", type: "bytes32" }, { name: "metadataUri", type: "string" }], outputs: [{ name: "tokenId", type: "uint256" }] }] as const;
const stampMintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "issuanceId", type: "bytes32" }, { name: "metadataUri", type: "string" }], outputs: [{ name: "tokenId", type: "uint256" }] }] as const;
const passportEventAbi = [{ type: "event", name: "PassportMinted", inputs: [{ indexed: true, name: "passportId", type: "bytes32" }, { indexed: true, name: "tokenId", type: "uint256" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "metadataUri", type: "string" }] }] as const;
const stampEventAbi = [{ type: "event", name: "StampMinted", inputs: [{ indexed: true, name: "issuanceId", type: "bytes32" }, { indexed: true, name: "tokenId", type: "uint256" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "metadataUri", type: "string" }] }] as const;

const passportPayload: PassportPayloadV1 = { recipient, celebritySlug: "kara", passportId };
const stampPayload: StampPayloadV1 = { recipient, celebritySlug: "kara", issuanceId, stampType: "Attendance" };
const reactionPayload: ReactionPayloadV1 = { recipient, celebritySlug: "kara", issuanceId, reactionType: "FirstReaction" };
const communityStampPayload: CommunityStampPayloadV1 = { recipient, celebritySlug: "kara", issuanceId, stampKind: "daily_checkin" };

function adapter(client: unknown) {
  return new ViemChainAdapter({
    rpcUrl: "https://rpc.example",
    chainId: 91342,
    privateKey,
    passportAddress,
    stampAddress,
    deploymentBlock: 1n,
    collectibleAddress,
    collectibleDeploymentBlock: 10n,
    client: client as PublicClient,
  });
}

async function submission(
  entityType: "passport" | "stamp" | "reaction" | "community_stamp",
  overrides: { chainId?: number; to?: Address; recipient?: Address; key?: Hash; metadataUri?: string; value?: bigint; nonce?: number; gas?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } = {},
): Promise<PreparedSubmission> {
  const isPassport = entityType === "passport";
  const signedTransaction = await privateKeyToAccount(privateKey).signTransaction({
    chainId: overrides.chainId ?? 91342,
    type: "eip1559",
    to: overrides.to ?? (isPassport ? passportAddress : stampAddress),
    nonce: overrides.nonce ?? 4,
    gas: overrides.gas ?? 200000n,
    maxFeePerGas: overrides.maxFeePerGas ?? 1n,
    maxPriorityFeePerGas: overrides.maxPriorityFeePerGas ?? 1n,
    value: overrides.value,
    data: encodeFunctionData({
      abi: isPassport ? passportMintAbi : stampMintAbi,
      functionName: "mint",
      args: [overrides.recipient ?? recipient, overrides.key ?? (isPassport ? passportId : issuanceId), overrides.metadataUri ?? "ipfs://expected"],
    }),
  });
  return { txHash: keccak256(signedTransaction), signedTransaction };
}

function mintLog(entityType: "passport" | "stamp" | "reaction" | "community_stamp", overrides: { address?: Address; recipient?: Address; key?: Hash; metadataUri?: string; tokenId?: bigint } = {}) {
  const isPassport = entityType === "passport";
  const tokenId = overrides.tokenId ?? 7n;
  return {
    address: overrides.address ?? (isPassport ? passportAddress : stampAddress),
    topics: isPassport
      ? encodeEventTopics({ abi: passportEventAbi, eventName: "PassportMinted", args: { passportId: overrides.key ?? passportId, tokenId, to: overrides.recipient ?? recipient } })
      : encodeEventTopics({ abi: stampEventAbi, eventName: "StampMinted", args: { issuanceId: overrides.key ?? issuanceId, tokenId, to: overrides.recipient ?? recipient } }),
    data: encodeAbiParameters([{ type: "string" }], [overrides.metadataUri ?? "ipfs://expected"]),
  };
}

describe("Viem mint transaction and receipt integrity", () => {
  it.each([
    ["passport", passportPayload],
    ["stamp", stampPayload],
    ["reaction", reactionPayload],
    ["community_stamp", communityStampPayload],
  ] as const)("accepts only the matching %s contract event and business identity", async (entityType, payload) => {
    const prepared = await submission(entityType);
    const validClient = { getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [mintLog(entityType)] }) };
    await expect(adapter(validClient).receipt(prepared.txHash, entityType, payload, prepared)).resolves.toEqual({ txHash: prepared.txHash, tokenId: 7n });

    for (const forged of [
      mintLog(entityType, { address: collectibleAddress }),
      mintLog(entityType, { key: `0x${"9".repeat(64)}` }),
      mintLog(entityType, { recipient: otherRecipient }),
      mintLog(entityType, { metadataUri: "ipfs://wrong" }),
    ]) {
      const client = { getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [forged] }) };
      await expect(adapter(client).receipt(prepared.txHash, entityType, payload, prepared)).rejects.toMatchObject({ code: "MINT_EVENT_NOT_FOUND", retryable: false });
    }
  });

  it.each([
    ["passport", passportPayload],
    ["stamp", stampPayload],
    ["reaction", reactionPayload],
    ["community_stamp", communityStampPayload],
  ] as const)("rejects a stored %s transaction for the wrong chain, target, recipient, key, or value", async (entityType, payload) => {
    const invalidSubmissions = await Promise.all([
      submission(entityType, { chainId: 1 }),
      submission(entityType, { to: entityType === "passport" ? stampAddress : passportAddress }),
      submission(entityType, { recipient: otherRecipient }),
      submission(entityType, { key: `0x${"a".repeat(64)}` }),
      submission(entityType, { value: 1n }),
    ]);
    const client = { getTransactionReceipt: vi.fn() };
    for (const invalid of invalidSubmissions) {
      await expect(adapter(client).receipt(invalid.txHash, entityType, payload, invalid)).rejects.toMatchObject({ code: "PREPARED_TRANSACTION_MISMATCH", retryable: false });
    }
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("reconciles legacy Passport state only when mapping, owner, event, recipient, and URI agree", async () => {
    const transactionHash = `0x${"b".repeat(64)}` as Hash;
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => functionName === "tokenByPassportId" ? 7n : functionName === "ownerOf" ? recipient : "ipfs://expected"),
      getLogs: vi.fn().mockResolvedValue([{ address: passportAddress, transactionHash, args: { passportId, tokenId: 7n, to: recipient, metadataUri: "ipfs://expected" } }]),
    };
    await expect(adapter(client).findExisting("passport", passportPayload)).resolves.toEqual({ txHash: transactionHash, tokenId: 7n });

    client.getLogs.mockResolvedValueOnce([{ address: passportAddress, transactionHash, args: { passportId, tokenId: 7n, to: otherRecipient, metadataUri: "ipfs://expected" } }]);
    await expect(adapter(client).findExisting("passport", passportPayload)).rejects.toMatchObject({ code: "MINT_CHAIN_STATE_MISMATCH", retryable: false });

    client.getLogs.mockResolvedValueOnce([{ address: collectibleAddress, transactionHash, args: { passportId, tokenId: 7n, to: recipient, metadataUri: "ipfs://expected" } }]);
    await expect(adapter(client).findExisting("passport", passportPayload)).rejects.toMatchObject({ code: "MINT_CHAIN_STATE_MISMATCH", retryable: false });
  });

  it.each([
    ["stamp", stampPayload],
    ["reaction", reactionPayload],
    ["community_stamp", communityStampPayload],
  ] as const)("reconciles legacy %s state through balance, event, recipient, and URI", async (entityType, payload) => {
    const transactionHash = `0x${"c".repeat(64)}` as Hash;
    const client = {
      readContract: vi.fn<(args: { functionName: string }) => Promise<unknown>>(async ({ functionName }) => functionName === "tokenByIssuanceId" ? 7n : functionName === "balanceOf" ? 1n : "ipfs://expected"),
      getLogs: vi.fn().mockResolvedValue([{ address: stampAddress, transactionHash, args: { issuanceId, tokenId: 7n, to: recipient, metadataUri: "ipfs://expected" } }]),
    };
    await expect(adapter(client).findExisting(entityType, payload)).resolves.toEqual({ txHash: transactionHash, tokenId: 7n });

    client.readContract.mockImplementationOnce(async () => 7n).mockImplementationOnce(async () => 0n).mockImplementationOnce(async () => "ipfs://expected");
    await expect(adapter(client).findExisting(entityType, payload)).rejects.toMatchObject({ code: "MINT_CHAIN_STATE_MISMATCH", retryable: false });
  });

  it.each([
    ["passport", passportPayload],
    ["stamp", stampPayload],
    ["reaction", reactionPayload],
    ["community_stamp", communityStampPayload],
  ] as const)("keeps a missing %s mint event retryable while RPC indexing catches up", async (entityType, payload) => {
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => functionName === "tokenByPassportId" || functionName === "tokenByIssuanceId"
        ? 7n
        : functionName === "ownerOf"
          ? recipient
          : functionName === "balanceOf"
            ? 1n
            : "ipfs://expected"),
      getLogs: vi.fn().mockResolvedValue([]),
    };
    await expect(adapter(client).findExisting(entityType, payload)).rejects.toMatchObject({ code: "MINT_EVENT_NOT_FOUND", retryable: true });
  });

  it("validates a stored transaction before a normal retry broadcast", async () => {
    const prepared = await submission("passport", { nonce: 11 });
    const client = {
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error("transaction could not be found")),
      sendRawTransaction: vi.fn().mockResolvedValue(prepared.txHash),
    };
    const chain = adapter(client);
    await expect(chain.receipt(prepared.txHash, "passport", passportPayload, prepared)).resolves.toBeNull();
    await expect(chain.broadcast(prepared.signedTransaction)).resolves.toBe(prepared.txHash);
    expect(client.sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("does not broadcast signed bytes that were not validated against a job", async () => {
    const prepared = await submission("passport");
    const client = { sendRawTransaction: vi.fn() };
    await expect(adapter(client).broadcast(prepared.signedTransaction)).rejects.toMatchObject({ code: "PREPARED_TRANSACTION_NOT_VALIDATED", retryable: false });
    expect(client.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("rejects malformed stored signed bytes before any receipt lookup or broadcast", async () => {
    const signedTransaction = "0x12" as Hex;
    const prepared = { txHash: keccak256(signedTransaction), signedTransaction };
    const client = { getTransactionReceipt: vi.fn(), sendRawTransaction: vi.fn() };
    const chain = adapter(client);
    await expect(chain.receipt(prepared.txHash, "passport", passportPayload, prepared)).rejects.toMatchObject({ code: "PREPARED_TRANSACTION_MISMATCH", retryable: false });
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
    expect(client.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("blocks an over-limit estimate before signing", async () => {
    const client = {
      getTransactionCount: vi.fn().mockResolvedValue(1),
      estimateGas: vi.fn().mockResolvedValue(1_000_001n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1_000_000n, maxPriorityFeePerGas: 1_000_000n }),
    };
    await expect(adapter(client).prepare("passport", passportPayload, "ipfs://expected")).rejects.toMatchObject({
      code: "MINT_FEE_POLICY_BLOCKED",
      message: "Mint transaction is temporarily blocked by fee policy",
      retryable: true,
    });
  });

  it("reconciles a completed high-fee transaction but blocks its retry broadcast", async () => {
    const prepared = await submission("passport", { gas: 1_000_001n, maxFeePerGas: 100_000_001n, maxPriorityFeePerGas: 100_000_000n });
    const completed = adapter({ getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [mintLog("passport")] }) });
    await expect(completed.receipt(prepared.txHash, "passport", passportPayload, prepared)).resolves.toEqual({ txHash: prepared.txHash, tokenId: 7n });

    const client = {
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error("transaction could not be found")),
      sendRawTransaction: vi.fn(),
    };
    const retry = adapter(client);
    await expect(retry.receipt(prepared.txHash, "passport", passportPayload, prepared)).resolves.toBeNull();
    await expect(retry.broadcast(prepared.signedTransaction)).rejects.toMatchObject({ code: "MINT_FEE_POLICY_BLOCKED", retryable: true });
    expect(client.sendRawTransaction).not.toHaveBeenCalled();
  });
});


describe("direct stamp binding version 2", () => {
  it.each([
    ["stamp", { ...stampPayload, bindingVersion: "2" }],
    ["stamp", { ...stampPayload, bindingVersion: 1 }],
    ["stamp", { ...stampPayload, stampType: "Knowledge", bindingVersion: 2 }],
    ["stamp", { ...stampPayload, stampType: "Reservation", bindingVersion: 2 }],
    ["stamp", { ...stampPayload, stampType: "Survey", bindingVersion: 2 }],
    ["passport", { ...passportPayload, bindingVersion: 2 }],
    ["reaction", { ...reactionPayload, bindingVersion: 2 }],
    ["community_stamp", { ...communityStampPayload, bindingVersion: 2 }],
  ] as const)("rejects invalid marker input at the %s adapter boundary", async (entityType, payload) => {
    const client = { estimateGas: vi.fn(), readContract: vi.fn() };
    const chain = adapter(client);
    await expect(chain.prepare(entityType, payload as unknown as JobPayload, "ipfs://expected")).rejects.toMatchObject({ code: "INVALID_JOB_PAYLOAD", retryable: false });
    await expect(chain.findExisting(entityType, payload as unknown as JobPayload)).rejects.toMatchObject({ code: "INVALID_JOB_PAYLOAD", retryable: false });
    expect(client.estimateGas).not.toHaveBeenCalled();
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it.each(["Attendance", "Membership"] as const)("prepares %s against only the fixed new stamp contract", async (stampType) => {
    const client = {
      getTransactionCount: vi.fn().mockResolvedValue(4),
      estimateGas: vi.fn().mockResolvedValue(200000n),
      estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
      sendRawTransaction: vi.fn(async ({ serializedTransaction }: { serializedTransaction: Hex }) => keccak256(serializedTransaction)),
    };
    const chain = adapter(client);
    const prepared = await chain.prepare("stamp", { ...stampPayload, stampType, bindingVersion: 2 }, "ipfs://expected");
    expect(getAddress(parseTransaction(prepared.signedTransaction as Hex).to!)).toBe(directStampAddress);
    expect(client.estimateGas).toHaveBeenCalledWith(expect.objectContaining({ to: directStampAddress }));
    await expect(chain.broadcast(prepared.signedTransaction)).resolves.toBe(prepared.txHash);
    expect(client.sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: prepared.signedTransaction });
  });

  it.each(["Attendance", "Membership"] as const)("recovers the same persisted %s envelope for each binding", async (stampType) => {
    for (const bindingVersion of [undefined, 2] as const) {
      const address = bindingVersion === 2 ? directStampAddress : stampAddress;
      const payload = { ...stampPayload, stampType, ...(bindingVersion === 2 ? { bindingVersion } : {}) };
      const prepared = await submission("stamp", { to: address, nonce: 23 });
      const client = {
        getTransactionReceipt: vi.fn().mockRejectedValueOnce(new Error("transaction could not be found"))
          .mockResolvedValueOnce({ status: "success", logs: [mintLog("stamp", { address })] }),
        sendRawTransaction: vi.fn().mockResolvedValue(prepared.txHash),
      };
      const restarted = adapter(client);
      await expect(restarted.receipt(prepared.txHash, "stamp", payload, prepared)).resolves.toBeNull();
      await expect(restarted.broadcast(prepared.signedTransaction)).resolves.toBe(prepared.txHash);
      expect(client.sendRawTransaction).toHaveBeenCalledExactlyOnceWith({ serializedTransaction: prepared.signedTransaction });
      await expect(restarted.receipt(prepared.txHash, "stamp", payload, prepared)).resolves.toEqual({ txHash: prepared.txHash, tokenId: 7n });
    }
  });

  it("does not authorize a stored envelope for the other binding target", async () => {
    for (const bindingVersion of [undefined, 2] as const) {
      const prepared = await submission("stamp", { to: bindingVersion === 2 ? stampAddress : directStampAddress });
      const payload = { ...stampPayload, ...(bindingVersion === 2 ? { bindingVersion } : {}) };
      const client = { getTransactionReceipt: vi.fn(), sendRawTransaction: vi.fn() };
      const chain = adapter(client);
      await expect(chain.receipt(prepared.txHash, "stamp", payload, prepared)).rejects.toMatchObject({ code: "PREPARED_TRANSACTION_MISMATCH", retryable: false });
      await expect(chain.broadcast(prepared.signedTransaction)).rejects.toMatchObject({ code: "PREPARED_TRANSACTION_NOT_VALIDATED", retryable: false });
      expect(client.getTransactionReceipt).not.toHaveBeenCalled();
      expect(client.sendRawTransaction).not.toHaveBeenCalled();
    }
  });

  it("reconciles new stamp state only through the selected contract and rejects old contract logs", async () => {
    const prepared = await submission("stamp", { to: directStampAddress });
    const payload: StampPayloadV1 = { ...stampPayload, bindingVersion: 2, workerSubmission: prepared };
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => functionName === "tokenByIssuanceId" ? 7n : functionName === "balanceOf" ? 1n : "ipfs://expected"),
      getLogs: vi.fn().mockResolvedValue([{ address: directStampAddress, transactionHash: prepared.txHash, args: { issuanceId, tokenId: 7n, to: recipient, metadataUri: "ipfs://expected" } }]),
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [mintLog("stamp", { address: stampAddress })] }),
    };
    const chain = adapter(client);
    await expect(chain.findExisting("stamp", payload)).resolves.toEqual({ txHash: prepared.txHash, tokenId: 7n });
    for (const [request] of client.readContract.mock.calls) expect(request).toMatchObject({ address: directStampAddress });
    expect(client.getLogs).toHaveBeenCalledWith(expect.objectContaining({ address: directStampAddress }));
    client.getLogs.mockResolvedValueOnce([{ address: stampAddress, transactionHash: prepared.txHash, args: { issuanceId, tokenId: 7n, to: recipient, metadataUri: "ipfs://expected" } }]);
    await expect(chain.findExisting("stamp", payload)).rejects.toMatchObject({ code: "MINT_CHAIN_STATE_MISMATCH", retryable: false });
    await expect(chain.receipt(prepared.txHash, "stamp", payload, prepared)).rejects.toMatchObject({ code: "MINT_EVENT_NOT_FOUND", retryable: false });
  });
});

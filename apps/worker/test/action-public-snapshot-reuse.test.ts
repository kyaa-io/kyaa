import { expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  numberToHex,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { actionHubAbi, erc1155TransferAbi } from "../src/action-abi.js";
import { readFinalizedActionSnapshot, verifiedActionFactKey, type VerifiedActionFacts } from "../src/action-public-snapshot.js";

const word = (value: number, prefix = 0) => numberToHex((BigInt(prefix) << 128n) + BigInt(value), { size: 32 }) as Hash;
const address = (byte: string) => `0x${byte.repeat(20)}` as Address;
const zeroHash = word(0);
const hub = address("11");
const eas = address("12");
const fan = address("13");
const stamp = address("15");
const environmentId = word(1, 0x21);
const schemaUid = word(1, 0x22);
const creatorId = word(1, 0x25);
const campaignId = word(1, 0x26);
const AUDITED = 128;

const blockHashOf = (number: bigint) => word(Number(number), 0x32);
const sourceOf = (index: number) => word(index, 0x23);
const txOf = (index: number) => word(index, 0x31);
const easUidOf = (index: number) => word(index, 0x24);
const eventBlockOf = (index: number) => 1_000n + BigInt(index);
const occurrenceOf = (index: number) => keccak256(encodeAbiParameters(
  [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
  [91342n, hub, environmentId, sourceOf(index)],
));
const actionIdOf = (index: number) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }], [occurrenceOf(index), 1]));

const refComponents = [
  { name: "nftContract", type: "address" }, { name: "tokenId", type: "uint256" },
  { name: "kind", type: "uint8" }, { name: "issuanceKey", type: "bytes32" },
  { name: "linkOrigin", type: "uint8" },
] as const;

/** A ledger of `count` actions, one per block, each minting one ERC-1155 stamp in its own transaction. */
function makeLedger(count: number) {
  const state = {
    count,
    headBlock: 5_000n,
    timestamp: 6_000_000n,
    canonicalHash: new Map<string, Hash>(),
    requestHash: new Map<number, Hash>(),
    eventBlockHash: new Map<number, Hash>(),
    failTransactionsAfter: Number.POSITIVE_INFINITY,
    foreignInvalidationBlock: undefined as bigint | undefined,
    implementation: address("1a"),
    codec: address("1b"),
    code: new Map<string, Hash>(),
    // Actions whose request hash the upgraded Hub code computes differently.
    upgradedRequestHash: new Set<number>(),
  };
  const indexByAction = new Map<string, number>();
  const indexByOccurrence = new Map<string, number>();
  const indexByTx = new Map<string, number>();
  const indexByEas = new Map<string, number>();
  const refOf = (index: number) => ({ nftContract: stamp, tokenId: BigInt(index + 1), kind: 1, issuanceKey: word(index, 0x51), linkOrigin: 0 });
  const attestationData = (index: number) => encodeAbiParameters([
    { type: "bytes32" }, { type: "bytes32" }, { type: "uint32" }, { type: "uint16" },
    { type: "uint16" }, { type: "uint32" }, { type: "bytes32" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "uint32" }, { type: "uint8" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "bytes32" },
  ], [occurrenceOf(index), actionIdOf(index), 1, 10, 1, 1, environmentId, creatorId, campaignId, 1, 0, word(1, 0x41),
    keccak256(encodeAbiParameters([{ type: "tuple[]", components: refComponents }], [[refOf(index)]])), zeroHash]);
  const requestOf = (index: number) => ({
    sourceOccurrence: sourceOf(index), revision: 1, actionCode: 10, schemaVersion: 1, policyVersion: 1,
    fan, creatorId, campaignId, occurredDay: 1, evidenceCommitment: word(1, 0x41), migrationBatchId: zeroHash, bindingVersion: 1,
  });
  const invalidated = (index: number) => index === 0 && state.foreignInvalidationBlock !== undefined;
  const logsOf = (index: number) => {
    const location = { address: hub, transactionHash: txOf(index), blockNumber: eventBlockOf(index),
      blockHash: state.eventBlockHash.get(index) ?? blockHashOf(eventBlockOf(index)), transactionIndex: 0 };
    const ref = refOf(index);
    return [
      { ...location, logIndex: 0,
        topics: encodeEventTopics({ abi: actionHubAbi, eventName: "CredentialLinked", args: { actionId: actionIdOf(index), nftContract: ref.nftContract, tokenId: ref.tokenId } }),
        data: encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }, { type: "uint8" }], [ref.kind, ref.issuanceKey, ref.linkOrigin]) },
      { ...location, logIndex: 1,
        topics: encodeEventTopics({ abi: actionHubAbi, eventName: "FanActionRecorded", args: { actionId: actionIdOf(index), fan, campaignId } }),
        data: encodeAbiParameters([
          { type: "bytes32" }, { type: "uint32" }, { type: "bytes32" }, { type: "string" },
          { type: "uint16" }, { type: "uint32" }, { type: "bytes32" }, { type: "uint32" },
          { type: "uint8" }, { type: "bytes32" },
        ], [occurrenceOf(index), 1, creatorId, "DAILY_CHECKIN", 1, 1, easUidOf(index), 1, 0, zeroHash]) },
      // A log source that places a record transaction's invalidation in a block no transaction read has proven.
      ...(invalidated(index) ? [{ ...location, blockNumber: state.foreignInvalidationBlock!, blockHash: blockHashOf(state.foreignInvalidationBlock!), logIndex: 2,
        topics: encodeEventTopics({ abi: actionHubAbi, eventName: "FanActionInvalidated", args: { actionId: actionIdOf(index), easUID: easUidOf(index) } }),
        data: encodeAbiParameters([{ type: "uint16" }], [1]) }] : []),
    ];
  };
  for (let index = 0; index < count + 16; index++) {
    indexByAction.set(actionIdOf(index).toLowerCase(), index);
    indexByOccurrence.set(occurrenceOf(index).toLowerCase(), index);
    indexByTx.set(txOf(index).toLowerCase(), index);
    indexByEas.set(easUidOf(index).toLowerCase(), index);
  }
  const transactions: number[] = [];
  const client = {
    getChainId: vi.fn(async () => 91342),
    getLogs: vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => Array.from({ length: state.count }, (_unused, index) => logsOf(index)).flat()
      .filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)),
    getBlock: vi.fn(async ({ blockTag, blockNumber }: { blockTag?: string; blockNumber?: bigint }) => {
      const number = blockTag === "finalized" ? state.headBlock : blockNumber!;
      return { number, hash: state.canonicalHash.get(number.toString()) ?? blockHashOf(number), timestamp: state.timestamp };
    }),
    getStorageAt: vi.fn(async ({ slot, blockNumber }: { slot: Hash; blockNumber?: bigint }) => {
      expect(blockNumber).toBe(state.headBlock);
      return `0x${"0".repeat(24)}${(slot.endsWith("7706") ? state.codec : state.implementation).slice(2)}`;
    }),
    getCode: vi.fn(async ({ address: target, blockNumber }: { address: Address; blockNumber?: bigint }) => {
      expect(blockNumber).toBe(state.headBlock);
      return state.code.get(target.toLowerCase()) ?? `0x60${target.slice(2, 4)}`;
    }),
    getTransaction: vi.fn(async ({ hash }: { hash: Hash }) => {
      const index = indexByTx.get(hash.toLowerCase())!;
      if (transactions.length >= state.failTransactionsAfter) throw new Error("RPC unavailable");
      transactions.push(index);
      return { hash, blockNumber: eventBlockOf(index), blockHash: blockHashOf(eventBlockOf(index)), to: hub,
        input: encodeFunctionData({ abi: actionHubAbi, functionName: "recordAndIssue", args: [requestOf(index), [
          { kind: 1, mode: 0, issuanceKey: refOf(index).issuanceKey, tokenId: refOf(index).tokenId, metadataUri: "" }]] }) };
    }),
    getTransactionReceipt: vi.fn(async ({ hash }: { hash: Hash }) => {
      const index = indexByTx.get(hash.toLowerCase())!;
      return { transactionHash: hash, blockNumber: eventBlockOf(index), blockHash: blockHashOf(eventBlockOf(index)), status: "success", logs: [{
        address: stamp,
        topics: encodeEventTopics({ abi: erc1155TransferAbi, eventName: "TransferSingle", args: { operator: hub, from: address("00"), to: fan } }),
        data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [refOf(index).tokenId, 1n]),
      }] };
    }),
    readContract: vi.fn(async ({ functionName, args, blockNumber }: { functionName: string; args?: readonly unknown[]; blockNumber?: bigint }) => {
      expect(blockNumber).toBe(state.headBlock);
      if (functionName === "environmentId") return environmentId;
      if (functionName === "eas") return eas;
      if (functionName === "getSchema") return schemaUid;
      if (functionName === "getAssetBinding") return stamp;
      if (functionName === "isAttestationValid") return true;
      if (functionName === "hashRequest") {
        const index = Number(BigInt((args![1] as { sourceOccurrence: Hash }).sourceOccurrence) & 0xffffffffn);
        return word(index, state.upgradedRequestHash.has(index) ? 0x43 : 0x42);
      }
      if (functionName === "latestActionId") return actionIdOf(indexByOccurrence.get(String(args![0]).toLowerCase())!);
      if (functionName === "getAction") {
        const index = indexByAction.get(String(args![0]).toLowerCase())!;
        return { occurrenceId: occurrenceOf(index), actionId: actionIdOf(index), easUID: easUidOf(index),
          requestHash: state.requestHash.get(index) ?? word(index, 0x42), recordHash: keccak256(attestationData(index)), schemaUID: schemaUid,
          refUID: zeroHash, fan, revision: 1, actionCode: 10, schemaVersion: 1, policyVersion: 1, status: invalidated(index) ? 3 : 2, origin: 0, migrationBatchId: zeroHash };
      }
      if (functionName === "getAttestation") {
        const index = indexByEas.get(String(args![0]).toLowerCase())!;
        return { uid: easUidOf(index), schema: schemaUid, time: 1n, expirationTime: 0n, revocationTime: invalidated(index) ? 2n : 0n,
          refUID: zeroHash, recipient: fan, attester: hub, revocable: true, data: attestationData(index) };
      }
      throw new Error(`Unexpected ${functionName}`);
    }),
  };
  const facts: VerifiedActionFacts = new Map();
  const options = {
    rpcUrl: "http://localhost:8545", chainId: 91342, hubAddress: hub, fromBlock: 1n, environmentId, schemaUid, easAddress: eas,
    assetBindings: { 1: { 1: stamp } }, client: client as unknown as PublicClient, facts,
  };
  const run = async () => {
    transactions.length = 0;
    for (const mock of [client.getTransaction, client.getTransactionReceipt, client.getBlock, client.readContract]) mock.mockClear();
    const snapshot = await readFinalizedActionSnapshot(options);
    return { snapshot, transactions: [...transactions],
      receipts: client.getTransactionReceipt.mock.calls.length,
      requestHashes: client.readContract.mock.calls.filter(([call]) => call.functionName === "hashRequest").length,
      blockReads: client.getBlock.mock.calls.map(([call]) => call.blockNumber ?? call.blockTag) };
  };
  return { state, client, options, facts, run, actionIdOf };
}

/** The same ledger verified with no stored facts: the reference result of a full verification. */
async function fullVerification(ledger: ReturnType<typeof makeLedger>) {
  const { facts: _stored, ...withoutFacts } = ledger.options;
  return readFinalizedActionSnapshot(withoutFacts);
}

it("verifies every action in full on the first run, proves event blocks by their transactions and records one fact per action", async () => {
  const ledger = makeLedger(300);
  const first = await ledger.run();
  expect(first.transactions).toHaveLength(300);
  expect(first.receipts).toBe(300);
  expect(first.requestHashes).toBe(300);
  // The pinned finalized head is read at the start and again at the end; no event block needs its own read.
  expect(first.blockReads).toEqual(["finalized", 5_000n]);
  expect(ledger.facts.size).toBe(300);
  for (const action of first.snapshot.actions) {
    const fact = ledger.facts.get(verifiedActionFactKey(hub, action.actionId))!;
    expect(fact).toMatchObject({ anchorBlockNumber: 5_000n, anchorBlockHash: blockHashOf(5_000n), sourceOccurrence: action.sourceOccurrence, bindingVersion: 1 });
    expect(action.verifiedFacts).toEqual({ digest: fact.digest, bindingVersion: 1 });
  }
});

it("reuses finalized facts on the next run: only new actions and the audited window read transactions, and the result equals a full verification", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.count = 303; ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  const second = await ledger.run();
  expect(second.transactions.filter((index) => index >= 300).sort()).toEqual([300, 301, 302]);
  // At most the audited window besides the three new actions; 300 actions were verified before.
  expect(second.transactions.length).toBeLessThanOrEqual(AUDITED + 3);
  expect(second.receipts).toBe(second.transactions.length);
  expect(second.requestHashes).toBe(second.transactions.length);
  // One read proves the previous finalized head (anchor) is still canonical.
  expect(second.blockReads).toEqual(["finalized", 5_000n, 5_600n]);
  expect(second.snapshot).toEqual(await fullVerification(ledger));
  expect(ledger.facts.size).toBe(303);
  expect([...ledger.facts.values()].every((fact) => fact.anchorBlockNumber === 5_600n)).toBe(true);
});

it("re-verifies every stored fact in rotation as the finalized timestamp advances", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  const audited = new Set<number>();
  for (let round = 1; round <= 3; round++) {
    ledger.state.headBlock += 600n; ledger.state.timestamp += 600n;
    const { transactions } = await ledger.run();
    expect(transactions).toHaveLength(AUDITED);
    for (const index of transactions) audited.add(index);
  }
  expect(audited.size).toBe(300);
});

it("returns to full verification when the previous finalized head is no longer canonical", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  ledger.state.canonicalHash.set("5000", word(5_000, 0x99));
  const second = await ledger.run();
  expect(second.transactions).toHaveLength(300);
  expect(second.receipts).toBe(300);
  expect(second.requestHashes).toBe(300);
  expect(second.snapshot).toEqual(await fullVerification(ledger));
});

it("never reuses a fact whose digest, source or binding was altered, and verifies that action in full", async () => {
  for (const alter of ["digest", "sourceOccurrence", "bindingVersion", "anchorBlockHash"] as const) {
    const ledger = makeLedger(300);
    await ledger.run();
    ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
    // Index 200 is outside this run's audited window, so only a rejected fact can make it read its transaction.
    const key = verifiedActionFactKey(hub, ledger.actionIdOf(200));
    const fact = ledger.facts.get(key)!;
    ledger.facts.set(key, { ...fact, ...(alter === "bindingVersion" ? { bindingVersion: 2 } : { [alter]: word(7, 0x77) }) });
    const second = await ledger.run();
    expect(second.transactions, alter).toContain(200);
    expect(second.transactions, alter).toHaveLength(AUDITED + 1);
    expect(second.snapshot, alter).toEqual(await fullVerification(ledger));
  }
}, 60_000);

it("discards every fact when the Hub implementation, the codec or their code changes, and verifies the whole ledger against the new code", async () => {
  const upgrades: Array<(state: ReturnType<typeof makeLedger>["state"]) => void> = [
    (state) => { state.implementation = address("2a"); },
    (state) => { state.codec = address("2b"); },
    (state) => { state.code.set(state.implementation.toLowerCase(), "0x6099" as Hash); },
    (state) => { state.code.set(state.codec.toLowerCase(), "0x6098" as Hash); },
    (state) => { state.code.set(hub.toLowerCase(), "0x6097" as Hash); },
  ];
  for (const [position, upgrade] of upgrades.entries()) {
    const ledger = makeLedger(300);
    await ledger.run();
    ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
    upgrade(ledger.state);
    const second = await ledger.run();
    expect(second.transactions, String(position)).toHaveLength(300);
    expect(second.requestHashes, String(position)).toBe(300);
    expect(second.receipts, String(position)).toBe(300);
    expect(second.snapshot, String(position)).toEqual(await fullVerification(ledger));
    // The facts are sealed again under the new code, so the run after the upgrade reuses them.
    ledger.state.headBlock = 6_200n; ledger.state.timestamp = 6_001_200n;
    expect((await ledger.run()).transactions, String(position)).toHaveLength(AUDITED);
  }
}, 60_000);

it("rejects the run, as a full verification does, when an upgrade changes the request hash of an action outside the audited window", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  // Without the upgrade this run reads 128 transactions and action 200 is not one of them.
  const audited = (await ledger.run()).transactions;
  expect(audited).toHaveLength(AUDITED);
  expect(audited).not.toContain(200);
  ledger.state.code.set(ledger.state.implementation.toLowerCase(), "0x6099" as Hash);
  ledger.state.upgradedRequestHash.add(200);
  await expect(ledger.run()).rejects.toThrow("transaction request hash mismatch");
  await expect(fullVerification(ledger)).rejects.toThrow("transaction request hash mismatch");
});

it("stops when the Hub proxy does not expose an implementation and a codec with code", async () => {
  const ledger = makeLedger(3);
  ledger.state.code.set(ledger.state.codec.toLowerCase(), "0x" as Hash);
  await expect(ledger.run()).rejects.toThrow("Hub code identity unavailable");
  ledger.state.code.clear();
  ledger.client.getStorageAt.mockResolvedValueOnce(`0x${"f".repeat(64)}` as never);
  await expect(ledger.run()).rejects.toThrow("Hub code identity unavailable");
});

it("verifies an action in full when its stored binding version is not a uint32, instead of failing the run", async () => {
  for (const bindingVersion of [0x1_0000_0000, Number.MAX_SAFE_INTEGER, -1, 1.5]) {
    const ledger = makeLedger(300);
    await ledger.run();
    ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
    const key = verifiedActionFactKey(hub, ledger.actionIdOf(200));
    ledger.facts.set(key, { ...ledger.facts.get(key)!, bindingVersion });
    const second = await ledger.run();
    expect(second.transactions, String(bindingVersion)).toContain(200);
    expect(second.transactions, String(bindingVersion)).toHaveLength(AUDITED + 1);
    expect(second.snapshot, String(bindingVersion)).toEqual(await fullVerification(ledger));
    expect(ledger.facts.get(key)!.bindingVersion).toBe(1);
  }
}, 60_000);

it("fails exactly as a full verification does when the Hub record of a verified action changes", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  ledger.state.requestHash.set(200, word(9, 0x98));
  await expect(ledger.run()).rejects.toThrow("transaction request hash mismatch");
  await expect(fullVerification(ledger)).rejects.toThrow("transaction request hash mismatch");
});

it("fails exactly as a full verification does when a log reports a verified action in a different block", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  ledger.state.eventBlockHash.set(200, word(9, 0x97));
  await expect(ledger.run()).rejects.toThrow("transaction location mismatch");
  await expect(fullVerification(ledger)).rejects.toThrow("transaction location mismatch");
});

it("keeps the facts of a run that fails and finishes the ledger on later runs", async () => {
  const ledger = makeLedger(300);
  ledger.state.failTransactionsAfter = 128;
  await expect(ledger.run()).rejects.toThrow("RPC unavailable");
  const kept = ledger.facts.size;
  expect(kept).toBeGreaterThanOrEqual(64);
  expect(kept).toBeLessThan(300);
  ledger.state.failTransactionsAfter = Number.POSITIVE_INFINITY;
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  const second = await ledger.run();
  expect(second.transactions.length).toBeLessThan(300);
  expect(second.transactions.length).toBeGreaterThanOrEqual(300 - kept);
  expect(second.snapshot).toEqual(await fullVerification(ledger));
  expect(ledger.facts.size).toBe(300);
});

it("refuses to reuse facts when the provider's finalized head is behind the block they were verified at", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.state.headBlock = 4_900n;
  await expect(ledger.run()).rejects.toThrow("finalized head is behind verified facts");
  expect(ledger.facts.size).toBe(300);
});

it("reads an event block directly when no transaction or reused fact has proven it", async () => {
  const ledger = makeLedger(300);
  ledger.state.foreignInvalidationBlock = 900n;
  // The block is canonical, so the direct read passes and the later location check rejects the inconsistent log.
  await expect(ledger.run()).rejects.toThrow("lifecycle transaction location mismatch");
  expect(ledger.client.getBlock).toHaveBeenCalledWith({ blockNumber: 900n });
  ledger.state.canonicalHash.set("900", word(900, 0x99));
  await expect(ledger.run()).rejects.toThrow("event block reorg");
});

it("drops the facts of actions that are no longer in the ledger", async () => {
  const ledger = makeLedger(300);
  await ledger.run();
  ledger.facts.set(verifiedActionFactKey(hub, word(1, 0xee)), { ...ledger.facts.values().next().value! });
  ledger.state.headBlock = 5_600n; ledger.state.timestamp = 6_000_600n;
  await ledger.run();
  expect(ledger.facts.size).toBe(300);
});

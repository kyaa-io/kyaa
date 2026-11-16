import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ActionWorker } from "../src/action-worker.js";
import { ViemActionHubAdapter } from "../src/adapters/viem-action-hub.js";
import { parseCanonicalActionPayload, type CanonicalActionPayloadV1, type FanActionJob } from "../src/action-domain.js";
import type { ActionChainPort, ActionQueuePort, ActionReceipt } from "../src/action-ports.js";
import type { PreparedSubmission } from "../src/domain.js";
import { KYAA_CREDENTIAL_ASSET_BASE_URI } from "../src/kyaa-credential-assets.js";

// RUN_DUKJIL_GIWA_FORK=1: GIWA Sepolia forked at a fixed block, the deployed kyaa community ActionHub (proxy, codec, KyaaStamp,
// context registry) and the real worker path. Inside the fork only, the Hub admin (timelock) grants WRITER to an Anvil key and
// the registry registrar registers the test creators. Nothing is sent to the real chain.
const enabled = process.env.RUN_DUKJIL_GIWA_FORK === "1";
const suite = enabled ? describe : describe.skip;
const FORK_BLOCK = 41_505_000n;
const deployment = {
  hub: "0xbd9991a26d0a0bf744ecdb8ad4f59f60a9132956", timelock: "0x40eaeb0b73c50da5053502eb3b836a6effe54642",
  registry: "0x4e104e5dfb3d466a2aac9ed0cf7572578068529b", stamp: "0x527a70c0f7cf129650dc282b709327c5958a4ccf",
  environment: "0xd5bc532db275cd70e5f55280b01cd2acc6b30b90d5aaa451adeb4b9a8f02c264",
  schema: "0xbd97671d89c9f4bb246e33369389332486f406ab821a0c7f88860034759c5c0b",
} as const;
const writerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const writer = privateKeyToAccount(writerKey).address;
const hubAbi = parseAbi(["function setRole(bytes32 role,address account,bool enabled)"]);
const registryAbi = parseAbi(["function registrar() view returns (address)", "function registerCreator(bytes32 creatorId,string publicSlug)",
  "function isValidContext(bytes32 creatorId,bytes32 campaignId) view returns (bool)"]);
const stampAbi = parseAbi(["function tokenByIssuanceId(bytes32) view returns (uint256)", "function balanceOf(address,uint256) view returns (uint256)"]);
const snapshots = (JSON.parse(readFileSync(new URL("./fixtures/dukjil-native-snapshots.json", import.meta.url), "utf8")) as Array<Record<string, any>>)
  .map((raw) => ({ ...raw, chainId: 91342, environmentId: deployment.environment, hubProxy: deployment.hub, schemaUid: deployment.schema,
    assetBaseUri: KYAA_CREDENTIAL_ASSET_BASE_URI,
    credentials: raw.credentials.map((credential: Record<string, unknown>) => ({ ...credential, nftContract: deployment.stamp })) }) as Record<string, any>);

class MemoryQueue implements ActionQueuePort {
  readonly jobs = new Map<string, FanActionJob & { status: string; receipt?: ActionReceipt; lastError?: string }>();
  add(id: string, sourceSnapshot: unknown) {
    this.jobs.set(id, { id, occurrenceRowId: id, payloadVersion: 1, sourceSnapshot, payload: null, actionId: null, requestHash: null,
      attempts: 0, maxAttempts: 8, txHash: null, signedTransaction: null, leaseOwner: "", leaseExpiresAt: "2099-01-01T00:00:00Z", status: "PENDING" });
  }
  async claim(workerId: string, batchSize: number) {
    const open = [...this.jobs.values()].filter((job) => job.status === "PENDING" || job.status === "RETRYING").slice(0, batchSize);
    for (const job of open) { job.status = "PROCESSING"; job.leaseOwner = workerId; job.attempts += 1; }
    return open.map((job) => ({ ...job }));
  }
  async admitDispatch() { return true; }
  async admitWriter() { return true; }
  async releaseWriter() {}
  async prepareCanonical(job: FanActionJob, payload: CanonicalActionPayloadV1) {
    const stored = this.jobs.get(job.id)!; stored.payload = payload; stored.actionId = payload.actionId; stored.requestHash = payload.requestHash;
    return { ...stored };
  }
  async recordPrepared(job: FanActionJob, submission: PreparedSubmission) {
    const stored = this.jobs.get(job.id)!; stored.txHash = submission.txHash; stored.signedTransaction = submission.signedTransaction;
    stored.payload = { ...(stored.payload as CanonicalActionPayloadV1), workerSubmission: submission };
    return { ...stored };
  }
  async complete(job: FanActionJob, receipt: ActionReceipt) { const stored = this.jobs.get(job.id)!; stored.status = "COMPLETED"; stored.receipt = receipt; }
  async retry(job: FanActionJob, code: string, _message: string, retryable: boolean) {
    const stored = this.jobs.get(job.id)!; stored.status = retryable ? "RETRYING" : "FAILED"; stored.lastError = code;
  }
}

/** Fails once at a chosen point: after signing (crash before broadcast) or after the node accepted it (response lost). */
class FaultyChain implements ActionChainPort {
  fired = false;
  constructor(private readonly inner: ViemActionHubAdapter, private readonly fault: "beforeBroadcast" | "afterBroadcast") {}
  get relayerAddress() { return this.inner.relayerAddress; }
  canonicalHashes(payload: Parameters<ActionChainPort["canonicalHashes"]>[0]) { return this.inner.canonicalHashes(payload); }
  findExisting(payload: CanonicalActionPayloadV1) { return this.inner.findExisting(payload); }
  prepare(payload: CanonicalActionPayloadV1) { return this.inner.prepare(payload); }
  receipt(payload: CanonicalActionPayloadV1, submission: PreparedSubmission) { return this.inner.receipt(payload, submission); }
  async broadcast(signed: string) {
    if (!this.fired && this.fault === "beforeBroadcast") { this.fired = true; throw Object.assign(new Error("worker stopped after signing"), { code: "TEST_CRASH" }); }
    const hash = await this.inner.broadcast(signed);
    if (!this.fired && this.fault === "afterBroadcast") { this.fired = true; throw Object.assign(new Error("response lost"), { code: "TEST_RESPONSE_LOST" }); }
    return hash;
  }
}

suite("dukjil code 10/12 on a GIWA Sepolia fork of the deployed Hub", () => {
  const port = 21_000 + (process.pid % 9_000);
  const rpcUrl = `http://127.0.0.1:${port}`;
  let anvil: ChildProcess;
  const client = createPublicClient({ transport: http(rpcUrl) });
  const rpc = (method: string, params: unknown[]) => client.request({ method: method as never, params: params as never });
  const adapter = () => new ViemActionHubAdapter({ rpcUrl, chainId: 91342, privateKey: writerKey, hubAddress: deployment.hub as Address,
    deploymentBlock: FORK_BLOCK, // Anvil suggests a 1 gwei tip; GIWA Sepolia itself runs near 0.001 gwei, so only the fork test widens the fee cap.
    feePolicy: { maxGas: 1_000_000n, maxFeePerGasWei: 5_000_000_000n, maxPriorityFeePerGasWei: 5_000_000_000n, maxExecutionFeeWei: 5_000_000_000_000_000n } });
  const worker = (queue: ActionQueuePort, chain: ActionChainPort) => new ActionWorker(queue, { pin: async () => "ipfs://bafkreidukjilforkmetadata" }, chain,
    { sleep: async () => { await rpc("evm_mine", []); } }, { workerId: "fork-worker", batchSize: 50, leaseSeconds: 120, receiptPollIntervalMs: 1, receiptPollAttempts: 5, workerEnvironment: "prod" });
  const gasUsed: bigint[] = [];

  beforeAll(async () => {
    anvil = spawn("anvil", ["--silent", "--port", String(port), "--fork-url", "https://sepolia-rpc.giwa.io", "--fork-block-number", String(FORK_BLOCK)], { stdio: "pipe" });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try { await client.getChainId(); break; } catch { await new Promise((wait) => setTimeout(wait, 100)); }
    }
    expect(await client.getChainId()).toBe(91342);
    const registrar = await client.readContract({ address: deployment.registry, abi: registryAbi, functionName: "registrar" });
    for (const account of [deployment.timelock, registrar, writer]) {
      await rpc("anvil_impersonateAccount", [account]);
      await rpc("anvil_setBalance", [account, "0x8AC7230489E80000"]);
    }
    const send = async (from: string, to: string, data: Hex) => {
      const hash = await rpc("eth_sendTransaction", [{ from, to, data }]) as Hex;
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success");
    };
    const { encodeFunctionData, keccak256, stringToHex } = await import("viem");
    await send(deployment.timelock, deployment.hub, encodeFunctionData({ abi: hubAbi, functionName: "setRole", args: [keccak256(stringToHex("WRITER_ROLE")), writer, true] }));
    for (const creator of new Set(snapshots.map((snapshot) => snapshot.creatorId as Hex))) {
      await send(registrar, deployment.registry, encodeFunctionData({ abi: registryAbi, functionName: "registerCreator", args: [creator, `fork-${creator.slice(-8)}`] }));
      expect(await client.readContract({ address: deployment.registry, abi: registryAbi, functionName: "isValidContext", args: [creator, `0x${"0".repeat(64)}`] })).toBe(true);
    }
  }, 120_000);
  afterAll(() => { anvil?.kill("SIGTERM"); });

  it("records every database snapshot once and mints one Stamp per original issuance key", async () => {
    const queue = new MemoryQueue();
    snapshots.forEach((snapshot, index) => queue.add(`job-${index}`, snapshot));
    await worker(queue, adapter()).runOnce();
    const failed = [...queue.jobs.values()].filter((job) => job.status !== "COMPLETED").map((job) => `${job.id}:${job.lastError}`);
    expect(failed).toEqual([]);
    for (const job of queue.jobs.values()) {
      const issuanceKey = (job.sourceSnapshot as any).credentials[0].issuanceKey as Hex;
      const tokenId = await client.readContract({ address: deployment.stamp, abi: stampAbi, functionName: "tokenByIssuanceId", args: [issuanceKey] });
      expect(tokenId).toBeGreaterThan(0n);
      expect(await client.readContract({ address: deployment.stamp, abi: stampAbi, functionName: "balanceOf", args: [(job.sourceSnapshot as any).recipient, tokenId] })).toBe(1n);
      const receipt = await client.getTransactionReceipt({ hash: job.receipt!.txHash as Hex });
      gasUsed.push(receipt.gasUsed);
    }
    const nonce = await client.getTransactionCount({ address: writer });
    // Second run of the same rows (lost completion): the Hub already has every action; no new transaction.
    const replay = new MemoryQueue();
    snapshots.forEach((snapshot, index) => replay.add(`replay-${index}`, snapshot));
    await worker(replay, adapter()).runOnce();
    expect([...replay.jobs.values()].every((job) => job.status === "COMPLETED")).toBe(true);
    expect(await client.getTransactionCount({ address: writer })).toBe(nonce);
    const average = gasUsed.reduce((sum, gas) => sum + gas, 0n) / BigInt(gasUsed.length);
    console.log(`FORK_GAS records=${gasUsed.length} avg=${average} min=${gasUsed.reduce((a, b) => a < b ? a : b)} max=${gasUsed.reduce((a, b) => a > b ? a : b)}`);
  }, 300_000);

  it.each(["beforeBroadcast", "afterBroadcast"] as const)("recovers from a %s fault with the same signed transaction", async (fault) => {
    const base = snapshots[0]!;
    const snapshot = { ...base, canonicalSourceKey: `${base.canonicalSourceKey}:${fault}`,
      credentials: [{ ...base.credentials[0], issuanceKey: `0x${(fault === "beforeBroadcast" ? "a1" : "b2").repeat(32)}`,
        metadata: { ...base.credentials[0].metadata, legacyPayload: { ...base.credentials[0].metadata.legacyPayload,
          issuanceId: `0x${(fault === "beforeBroadcast" ? "a1" : "b2").repeat(32)}` } } }] };
    const queue = new MemoryQueue();
    queue.add(`fault-${fault}`, snapshot);
    const nonceBefore = await client.getTransactionCount({ address: writer });
    const faulty = new FaultyChain(adapter(), fault);
    await worker(queue, faulty).runOnce();
    const stored = queue.jobs.get(`fault-${fault}`)!;
    expect(stored.status, stored.lastError).toBe("RETRYING");
    expect(stored.signedTransaction ?? "").toMatch(/^0x/);
    const signedHash = stored.txHash;
    // A new process (fresh adapter) resumes from the stored signature.
    await worker(queue, adapter()).runOnce();
    expect(stored.status).toBe("COMPLETED");
    expect(stored.receipt!.txHash.toLowerCase()).toBe(signedHash!.toLowerCase());
    expect(parseCanonicalActionPayload(stored)!.workerSubmission!.txHash).toBe(signedHash);
    expect(await client.getTransactionCount({ address: writer })).toBe(nonceBefore + 1);
    const tokenId = await client.readContract({ address: deployment.stamp, abi: stampAbi, functionName: "tokenByIssuanceId", args: [snapshot.credentials[0].issuanceKey as Hex] });
    expect(tokenId).toBeGreaterThan(0n);
  }, 120_000);
});
